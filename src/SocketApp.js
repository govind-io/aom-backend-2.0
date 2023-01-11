import { io } from "./App.js";
import { Client } from "./database/Models/clients.js";
import jsonwebtoken from "jsonwebtoken";
import { Room } from "./database/Models/rooms.js";
import {
  ActiveWorkerIDX,
  AllRouters,
  CreateWebRTCTransport,
  defaultAudioVolumeObserverConfig,
  mediaCodecs,
  UpdateActiveWorkerIDX,
  UpdateRouters,
  Worker,
} from "./Mediasoup/index.js";
import {
  AddProducerToRouter,
  ChooseRouter,
  PipeToAllRouters,
  RemoveLoadOnRouter,
  RemoveProducerToRouter,
} from "./Mediasoup/LoadBalancingUtils.js";
import { CreateAndHandleAudioLevelObserverEvents } from "./Mediasoup/AudioLevelObserver.js";

export const socketHandler = async () => {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      socket.disconnect();
    }

    try {
      const { id, roomname } = jsonwebtoken.verify(
        token,
        process.env.SECRET_KEY
      );

      const client = await Client.findById(id);

      if (!client) return socket.disconnect();

      const rooms = await client.populate({
        path: "room",
        match: {
          name: roomname,
        },
        option: {
          limit: 1,
        },
      });

      if (rooms.room.length === 0) {
        const room = new Room({ name: roomname, owner: client._id });

        try {
          await room.save();
          rooms.room.push(room);
        } catch (e) {
          console.log({ error: e, location: "saving room" });
        }
      }

      socket.handshake.query = {
        ...socket.handshake.query,
        room: rooms.room[0],
      };

      let routerExists = AllRouters[roomname];

      if (!routerExists) {
        routerExists = await Worker[ActiveWorkerIDX].createRouter({
          mediaCodecs,
        });

        const rtpCapabilities = await routerExists.rtpCapabilities;

        const temp = AllRouters;

        temp[roomname] = {
          routers: [
            {
              router: routerExists,
              rtpCapabilities,
              worker: Worker[ActiveWorkerIDX],
              load: 0,
              producers: [],
              consumers: [],
              audioLevelObserver: undefined,
            },
          ],
          peers: {},
          volumes: {},
        };

        if (ActiveWorkerIDX + 1 === Worker.length) {
          UpdateActiveWorkerIDX(0);
        } else {
          UpdateActiveWorkerIDX(ActiveWorkerIDX + 1);
        }

        UpdateRouters(temp);
      }

      next();
    } catch (e) {
      socket.disconnect();
      console.log("disconnected", {
        error: e,
        location: "Initiating socket connection",
      });
    }
  });

  io.on("connection", async (socket) => {
    const { uid, role, room } = socket.handshake.query;

    let Existing = room.participants.find(
      (item) => item.name === uid && item.role === role
    );

    if (Existing) {
      try {
        const existingPeer = AllRouters[room.name].peers[uid];
        await existingPeer.transport.close();
        existingPeer.receiverTransport.forEach(async (item) => {
          await item.close();
        });
        io.sockets.sockets.forEach((socket) => {
          // If given socket id is exist in list of all sockets, kill it
          if (socket.id === existingPeer.id) {
            socket.disconnect(true);
          }
        });
      } catch (e) {
        console.log("error occured while kicking out existing user", { e });
      }
    } else {
      room.participants = room.participants.concat({
        role,
        name: uid,
        socketId: socket.id,
      });
    }

    let updatedParticipants = false;

    try {
      await Room.findByIdAndUpdate(room._id, {
        participants: room.participants,
      });
      updatedParticipants = true;
    } catch (e) {
      console.log({ error: e, location: "adding participants" });
      socket.disconnect();
    }

    if (!updatedParticipants) return;

    socket.join(room.name);
    const temp = AllRouters;

    const peerRouter = await ChooseRouter({ roomname: room.name });

    temp[room.name].peers[uid] = {
      id: socket.id,
      roomname: room.name,
      producers: [],
      consumers: [],
      name: uid,
      role,
      transport: "",
      receiverTransport: [],
      router: peerRouter,
    };

    UpdateRouters(temp);

    socket.to(room.name).emit("user-joined", { uid, role });

    socket.emit("connected", { id: socket.id, role });

    socket.on("disconnect", async (reason) => {
      socket.to(room.name).emit("user-left", { uid, role });

      RemoveLoadOnRouter({
        roomname: room.name,
        routerId: AllRouters[room.name].peers[uid].router.router.id,
      });

      if (reason === "server namespace disconnect") {
        console.log("disconnected due to server namespace disconnect");
        return;
      }

      try {
        const localRoom = await Room.findById(room._id);
        localRoom.participants = localRoom.participants.filter(
          (item) => item.name !== uid
        );
        await Room.findByIdAndUpdate(room._id, {
          participants: localRoom.participants,
        });

        try {
          const thisPeer = AllRouters[room.name].peers[uid];
          thisPeer.transport.close();
          thisPeer.receiverTransport.forEach((elem) => elem.close());
        } catch (e) {
          console.log("error occured", e.message);
        }
      } catch (e) {
        console.log({ error: e, location: "removing participants" });
      }

      try {
        const newPeers = AllRouters[room.name].peers;
        delete newPeers[uid];

        UpdateRouters({
          ...AllRouters,
          [room.name]: {
            ...AllRouters[room.name],
            peers: newPeers,
          },
        });

        console.log({ newPeers });

        if (Object.keys(newPeers).length === 0) {
          await AllRouters[room.name].routers.forEach((item) => {
            item.router.close();
          });

          const temp = AllRouters;

          if (temp[room.name].intervalHandler) {
            clearInterval(temp[room.name].intervalHandler);
          }

          delete temp[room.name];

          UpdateRouters(temp);
        }
      } catch (e) {
        console.log("error updating peers list", e);
      }
    });

    //custom event handling from here
    socket.on("send-message", async ({ content }, callback) => {
      const data = {
        content,
        date: new Date().getTime(),
        by: uid,
      };

      const localRoom = await Room.findById(room._id);

      localRoom.messages = localRoom.messages.concat(data);

      await Room.findByIdAndUpdate(room._id, { messages: localRoom.messages });

      io.to(room.name).emit("message", data);
      callback();
    });

    //rtc logic starts here

    //step one - Loading the device irrespective of the role
    socket.on("get-rtp-capabilities", async (callback) => {
      const routerRtpCapabilities =
        AllRouters[room.name].peers[uid].router.rtpCapabilities;

      callback({ routerRtpCapabilities });
    });

    socket.on("device-connected", () => {
      const allPeers = Object.keys(AllRouters[room.name].peers);
      const ExistingProducingUsers = allPeers.filter((elem) => {
        return (
          AllRouters[room.name].peers[elem].role === "host" &&
          AllRouters[room.name].peers[elem].producers.length > 0 &&
          elem !== uid
        );
      });

      allPeers.forEach((elem) => {
        if (AllRouters[room.name].peers[elem].device) {
          socket.emit("rtc-user-joined", {
            uid: elem,
            role: AllRouters[room.name].peers[elem].role,
          });
        }
      });

      socket.to(room.name).emit("rtc-user-joined", { uid, role });

      ExistingProducingUsers.forEach((elem) => {
        const ExistingPeer = AllRouters[room.name].peers[elem];

        ExistingPeer.producers.forEach((item) => {
          socket.emit("user-published", {
            uid: elem,
            producerId: item.producer.id,
            kind: item.producer.kind,
            type: item.type,
          });
        });
      });

      const temp = AllRouters;

      temp[room.name].peers[uid].device = true;
    });

    //step for creating a send transport
    socket.on("create-producer-transport", async (callback) => {
      if (role !== "host") {
        return callback(null, new Error("host can not produce tracks"));
      }

      try {
        const peerRouter = AllRouters[room.name].peers[uid].router.router;
        const producerTransport = await CreateWebRTCTransport(peerRouter);

        const params = {
          id: producerTransport.id,
          iceParameters: producerTransport.iceParameters,
          iceCandidates: producerTransport.iceCandidates,
          dtlsParameters: producerTransport.dtlsParameters,
        };

        UpdateRouters({
          ...AllRouters,
          [room.name]: {
            ...AllRouters[room.name],
            peers: {
              ...AllRouters[room.name].peers,
              [uid]: {
                ...AllRouters[room.name].peers[uid],
                transport: producerTransport,
              },
            },
          },
        });

        callback(params, null);
      } catch (e) {
        return callback(null, e.message);
      }
    });

    socket.on("connect-producer", async ({ dtlsParameters }, callback) => {
      if (role !== "host") {
        return callback(new Error("host can not produce tracks"));
      }
      callback();

      try {
        await AllRouters[room.name].peers[uid].transport.connect({
          dtlsParameters,
        });
      } catch (error) {
        callback(error);
      }
    });

    socket.on(
      "produce-producer",
      async ({ rtpParameters, kind, type }, callback) => {
        if (role !== "host") {
          return callback(new Error("host can not produce tracks"));
        }
        let producer;

        try {
          producer = await AllRouters[room.name].peers[uid].transport.produce({
            rtpParameters,
            kind,
          });

          const peerRouter = AllRouters[room.name].peers[uid].router.router;

          AddProducerToRouter({
            roomname: room.name,
            routerId: peerRouter.id,
            producerId: producer.id,
            kind: producer.kind,
          });

          PipeToAllRouters({
            roomname: room.name,
            producer: producer,
            routerId: peerRouter.id,
          });

          socket.to(room.name).emit("user-published", {
            uid,
            producerId: producer.id,
            role,
            kind,
            type,
          });
        } catch (e) {
          console.log("error occured", e);
          return callback({ error: e });
        }

        const temp = AllRouters;

        temp[room.name].peers[uid].producers.push({ producer, type });

        UpdateRouters(temp);

        //adding producer events
        producer.on("transportclose", () => {
          producer.close();
          const temp = AllRouters;
          temp[room.name].peers[uid].producers = temp[room.name].peers[
            uid
          ].prodcuers.filter((item) => item.producer.id !== producer.id);
          temp[room.name].peers[uid].transport = "";
          UpdateRouters(temp);
        });

        producer.observer.on("close", async () => {
          const temp = AllRouters;
          temp[room.name].peers[uid].producers = temp[room.name].peers[
            uid
          ]?.producers.filter((elem) => elem.producer.id !== producer.id);

          RemoveProducerToRouter({
            roomname: room.name,
            routerId: AllRouters[room.name].peers[uid].router.router.id,
            producerId: producer.id,
            kind: producer.kind,
          });

          UpdateRouters(temp);
        });

        callback({ id: producer.id });
      }
    );

    socket.on("closed-producer", ({ producerId }) => {
      const temp = AllRouters;
      temp[room.name].peers[uid].producers = temp[room.name].peers[
        uid
      ].producers.filter((item) => {
        if (item.producer.id === producerId) {
          item.producer.close();
        }

        return item.producer.id !== producerId;
      });

      UpdateRouters(AllRouters);
    });

    socket.on("producer-paused", async ({ producerId }) => {
      const pausedProducer = AllRouters[room.name].peers[uid].producers.find(
        (item) => item.producer.id === producerId
      );
      try {
        await pausedProducer.producer.pause();
      } catch (e) {
        console.log("error occureed", e);
      }
    });

    socket.on("producer-resume", async ({ producerId }) => {
      const resumedProducer = AllRouters[room.name].peers[uid].producers.find(
        (item) => item.producer.id === producerId
      );
      try {
        await resumedProducer.producer.resume();
      } catch (e) {
        console.log("error occureed", e);
      }
    });

    //receiver handling starts here
    socket.on("create-reciever-transport", async (callback) => {
      try {
        const receiverTransport = await CreateWebRTCTransport(
          AllRouters[room.name].peers[uid].router.router
        );
        const params = {
          id: receiverTransport.id,
          iceParameters: receiverTransport.iceParameters,
          iceCandidates: receiverTransport.iceCandidates,
          dtlsParameters: receiverTransport.dtlsParameters,
        };

        const temp = AllRouters;

        temp[room.name].peers[uid] = {
          ...AllRouters[room.name].peers[uid],
          receiverTransport: [
            ...AllRouters[room.name].peers[uid].receiverTransport,
            receiverTransport,
          ],
        };

        UpdateRouters(temp);

        callback(params, null);
      } catch (e) {
        return callback(null, e.message);
      }
    });

    socket.on(
      "connect-consumer",
      async ({ dtlsParameters, serverConsumerTransportId }, callback) => {
        const consumerTransportToConnect = AllRouters[room.name].peers[
          uid
        ].receiverTransport.find(
          (item) => item.id === serverConsumerTransportId
        );

        if (!consumerTransportToConnect) {
          return callback(error);
        }

        try {
          const consumer = await consumerTransportToConnect.connect({
            dtlsParameters,
          });
          callback();

          const temp = AllRouters;

          temp[room.name].peers.consumers =
            temp[room.name].peers.consumers.push(consumer);

          UpdateRouters(AllRouters);
        } catch (e) {
          return callback(e);
        }
      }
    );

    socket.on(
      "consume-consumer",
      async (
        { rtpCapabilities, producerId, serverConsumerTransportId, producerUid },
        callback
      ) => {
        const ConsumerTransportToConsume = AllRouters[room.name].peers[
          uid
        ].receiverTransport.find(
          (item) => item.id === serverConsumerTransportId
        );

        if (
          AllRouters[room.name].peers[uid].router.router.canConsume({
            producerId,
            rtpCapabilities,
          }) &&
          ConsumerTransportToConsume
        ) {
          let consumer;

          try {
            consumer = await ConsumerTransportToConsume.consume({
              producerId,
              rtpCapabilities,
              paused: true,
            });
            const temp = AllRouters;

            temp[room.name].peers[uid].consumers.push({
              producerUid,
              consumer,
            });

            UpdateRouters(temp);
          } catch (e) {
            console.log("error while consuming the transport", e.message);
            return callback(null, "can not consume this producer");
          }

          consumer.on("transportclose", () => {
            consumer.close();
            const temp = AllRouters;
            temp.AllRouters[room.name].peers[uid].consumers = temp.AllRouters[
              room.name
            ].peers[uid].consumers.filter(
              (item) => item.consumer.id !== consumer.id
            );
            UpdateRouters(temp);
          });

          consumer.on("producerclose", () => {
            socket.emit("user-unpublished", { producerId });
            socket.emit("producer-closed", { producerId });
            //ConsumerTransportToConsume.close([])

            consumer.close();
            const temp = AllRouters;
            temp.AllRouters[room.name].peers[uid].consumers = temp.AllRouters[
              room.name
            ].peers[uid].consumers.filter(
              (item) => item.consumer.id === consumer.id
            );
            temp.AllRouters[room.name].peers[uid].receiverTransport =
              temp.AllRouters[room.name].peers[uid].receiverTransport.filter(
                (elem) => elem.id !== ConsumerTransportToConsume.id
              );
            UpdateRouters(temp);
          });

          consumer.observer.on("pause", () => {
            socket.emit("consumer-paused", {
              consumerId: consumer.id,
              uid: producerUid,
            });
          });

          consumer.observer.on("resume", () => {
            socket.emit("consumer-resume", {
              consumerId: consumer.id,
              uid: producerUid,
            });
          });

          consumer.observer.on("close", () => {
            consumer.close();
            const temp = AllRouters;
            temp.AllRouters[room.name].peers[uid].consumers = temp.AllRouters[
              room.name
            ].peers[uid]?.consumers.filter(
              (item) => item.consumer.id === consumer.id
            );
            UpdateRouters(temp);
          });

          const data = {
            id: consumer.id,
            producerId: producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
          };

          // send the parameters to the client
          callback(data);
        } else {
          callback(null, "can not consume this producer");
        }
      }
    );

    socket.on("resume-consumer", async ({ consumer_id }, callback) => {
      try {
        const consumer = AllRouters[room.name].peers[uid].consumers.find(
          (item) => item.consumer.id === consumer_id
        ).consumer;

        if (!consumer.producerPaused) {
          await consumer.resume();
          return;
        }

        callback({ keepPaused: consumer.producerPaused || null });
      } catch (e) {
        console.log("error while resuming track ", e.message);
      }
    });

    //for volume observer logic starts from here
    socket.on("enable-volume-observer", async (callback) => {
      if (AllRouters[room.name].audioLevelObserver) {
        return callback();
      }
      try {
        await AllRouters[room.name].routers.forEach(async (item) => {
          await CreateAndHandleAudioLevelObserverEvents({
            roomname: room.name,
            mainRouterObj: item,
          });
        });
      } catch (e) {
        callback(e.message);
      }

      const interval = setInterval(() => {
        io.in(room.name).emit("volumes", AllRouters[room.name].volumes);
      }, [defaultAudioVolumeObserverConfig.interval]);

      const temp = AllRouters;

      temp[room.name].intervalHandler = interval;

      UpdateRouters(temp);

      callback();
    });

    socket.on("consumer-closed", ({ consumerId }) => {
      const temp = AllRouters;
      temp[room.name].peers[uid].consumers = temp[room.name].peers[
        uid
      ].consumers.filter((item) => {
        if (consumerId === item.consumer.id) {
          item.consumer.close();
        }

        return item.id !== consumerId;
      });
    });
  });
};
