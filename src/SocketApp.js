import { io } from "./App.js";
import { Client } from "./database/Models/clients.js";
import jsonwebtoken from "jsonwebtoken";
import { Room } from "./database/Models/rooms.js";
import { RTCRoom } from "./Mediasoup/Rooms.js";
import { AllRouters, UpdateRouters } from "./Mediasoup/StateData.js";

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

      let routerExists = AllRouters[roomname];

      if (!routerExists) {
        const newRoom = new RTCRoom(roomname, rooms.room[0]._id);

        await newRoom.init();

        const temp = AllRouters;

        temp[roomname] = newRoom;

        UpdateRouters(temp);

        routerExists = newRoom;
      }

      socket.handshake.query = {
        ...socket.handshake.query,
        room: routerExists,
      };

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

    let Existing = room.getPeer(uid);

    if (Existing) {
      try {
        console.log({ Existing });
        Existing.close();
      } catch (e) {
        console.log("error occured while kicking out existing user", { e });
      }
    }

    const peer = await room.createPeer({ socket, uid, role });

    //step one - Loading the device irrespective of the role
    peer.on("get-rtp-capabilities", async (callback) => {
      const routerRtpCapabilities = peer.router.rtpCapabilities;

      callback({ routerRtpCapabilities });
    });

    peer.on("device-connected", peer.deviceConnected);

    //step for creating a send transport
    peer.on("create-producer-transport", async (callback) => {
      if (role !== "host") {
        return callback(null, new Error("host can not produce tracks"));
      }

      try {
        const producerTransport = await peer.createProducerTransport();

        const params = {
          id: producerTransport.id,
          iceParameters: producerTransport.iceParameters,
          iceCandidates: producerTransport.iceCandidates,
          dtlsParameters: producerTransport.dtlsParameters,
        };

        callback(params, null);
      } catch (e) {
        return callback(null, e.message);
      }
    });

    peer.on("connect-producer", peer.connectProducer);

    peer.on("produce-producer", peer.produceProducer);

    peer.on("closed-producer", peer.producerClosed);

    peer.on("producer-paused", peer.pauseProducer);

    peer.on("producer-resume", peer.resumeProducer);

    //receiver handling starts here
    peer.on("create-reciever-transport", async (callback) => {
      try {
        const receiverTransport = await peer.createConsumerTransport();

        const params = {
          id: receiverTransport.id,
          iceParameters: receiverTransport.iceParameters,
          iceCandidates: receiverTransport.iceCandidates,
          dtlsParameters: receiverTransport.dtlsParameters,
        };

        callback(params, null);
      } catch (e) {
        return callback(null, e.message);
      }
    });

    peer.on("connect-consumer", peer.connectConsumer);

    peer.on("consume-consumer", peer.consumeConsumer);

    peer.on("resume-consumer", peer.resumeConsumer);

    //for volume observer logic starts from here
    peer.on("enable-volume-observer", async (callback) => {
      if (room.audioLevelObserver) {
        return callback();
      }
      try {
        await room.createRoomAudioLevelObserver();
      } catch (e) {
        callback(e.message);
        console.log("error occured here ", e);
      }

      callback();
    });

    peer.on("consumer-closed", peer.consumerClosed);
  });
};
