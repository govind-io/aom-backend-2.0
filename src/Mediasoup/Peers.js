import { Room } from "../database/Models/rooms.js";
import { CreateWebRTCTransport } from "./Utils.js";
import { io } from "../App.js";

export class Peer {
  constructor({ socket, uid, role, router, room }) {
    this.socket = socket;
    this.uid = uid;
    this.role = role;
    this.router = router;
    this.room = room;

    this.init();
  }

  init = async () => {
    await Room.findByIdAndUpdate(
      this.room.id,
      {
        $push: {
          participants: {
            role: this.role,
            name: this.uid,
            socketId: this.socket.id,
          },
        },
      },
      { new: true }
    );

    await this.socket.join(this.room.name);

    await this.socket.emit("connected", {
      id: this.socket.id,
      role: this.role,
    });

    await this.socket
      .to(this.room.name)
      .emit("user-joined", { uid: this.uid, role: this.role });

    this.router.addLoad(this.uid, this);

    this.socket.on("disconnect", async () => {
      this.socket
        .to(this.room.name)
        .emit("user-left", { uid: this.uid, role: this.role });

      this.close();
    });

    this.socket.on("send-message", async ({ content }, callback) => {
      const data = {
        content,
        date: new Date().getTime(),
        by: this.uid,
      };

      io.to(this.room.name).emit("message", data);

      await Room.findByIdAndUpdate(
        this.room.id,
        { $push: { messages: data } },
        { new: true }
      );
      callback();
    });

    this.socket.on("notification", ({ content, to }) => {
      if (!to) {
        return this.socket
          .to(this.room.name)
          .emit("notification", { content, by: this.uid });
      }

      const allPeers = this.room.getAllPeers(this.uid);

      const peerToNotify = allPeers.find((item) => item.uid === to);

      if (!peerToNotify) return;

      io.to(peerToNotify.socket.id).emit("notifiation", {
        content,
        by: this.uid,
      });
    });
  };

  close = () => {
    this.producers.forEach((item) => {
      item.close();
    });

    this.consumers.forEach((item) => item.close());

    this.producingTransports.forEach((item) => item?.close());

    this.consumingTransports.forEach((item) => item?.close());

    this.socket?.disconnect();

    this.producers = [];

    this.consumer = [];

    this.producingTransports = [];

    this.consumingTransports = [];

    this.router?.removeLoad(this.uid);

    delete this.room?.peers[this.uid];

    Room.findByIdAndUpdate(
      this.room.id,
      { $pull: { participants: { name: this.uid } } },
      { new: true },
      (err, doc) => {
        if (err) {
          console.log("err updating participants list ", err);
        }
      }
    );
  };

  on = (...args) => {
    this.socket.on(...args);
  };

  emit = (...args) => {
    this.socket.emit(...args);
  };

  deviceConnected = () => {
    const allPeers = this.room.getAllPeers(this.uid);

    allPeers.forEach((elem) => {
      this.socket.emit("rtc-user-joined", {
        uid: elem.uid,
        role: elem.role,
      });
    });

    this.socket
      .to(this.room.name)
      .emit("rtc-user-joined", { uid: this.uid, role: this.role });

    allPeers.forEach((elem) => {
      elem.producers.forEach((item) => {
        this.socket.emit("user-published", {
          uid: elem.uid,
          producerId: item.id,
          kind: item.kind,
          type: elem.customTypeProducers[item.id],
        });
      });
    });

    this.setDevice(true);
  };

  setDevice = (val) => {
    this.device = val;
  };

  createProducerTransport = async () => {
    const transport = await CreateWebRTCTransport(this.router.router);

    this.producingTransports.push(transport);

    return transport;
  };

  createConsumerTransport = async () => {
    const transport = await CreateWebRTCTransport(this.router.router);

    this.consumingTransports.push(transport);

    return transport;
  };

  connectProducer = async ({ dtlsParameters }, callback) => {
    if (this.role !== "host") {
      return callback(new Error("host can not produce tracks"));
    }

    try {
      await this.producingTransports[0].connect({
        dtlsParameters,
      });
      callback();
    } catch (error) {
      callback(error);
      console.log("error connecting producer", error);
    }
  };

  produceProducer = async ({ rtpParameters, kind, type }, callback) => {
    if (this.role !== "host") {
      return callback(new Error("audience can not produce tracks"));
    }

    try {
      const producer = await this.producingTransports[0].produce({
        rtpParameters,
        kind,
      });

      this.producers.push(producer);

      if (producer.kind === "audio")
        await this.router.audioLevelObserver?.addProducer({
          producerId: producer.id,
        });

      await this.room.PipeToAllRouters({
        producerId: producer.id,
        producerRouter: this.router.router,
      });

      this.socket.to(this.room.name).emit("user-published", {
        uid: this.uid,
        producerId: producer.id,
        role: this.role,
        kind,
        type,
      });

      if (type !== "audio" && type !== "video") {
        this.customTypeProducers[producer.id] = type;
      }

      //adding producer events
      producer.on("transportclose", () => {
        this.producingTransports = [];
      });

      producer.observer.on("close", async () => {
        this.producers = this.producers.filter((item) => {
          return item.id !== producer.id;
        });

        try {
          if (producer.kind === "audio") {
            delete this.room.volumes[this.uid];

            await this.router.audioLevelObserver?.removeProducer({
              producerId: producer.id,
            });
          }
        } catch (e) {
          console.log("producer left");
        }
      });

      callback({ id: producer.id });
    } catch (e) {
      console.log("error occured here", e);
      return callback({ error: e });
    }
  };

  producerClosed = async ({ producerId }) => {
    this.producers = this.producers.filter((item) => {
      if (item.id === producerId) {
        item.close();
      }

      return item.id !== producerId;
    });
  };

  pauseProducer = async ({ producerId }) => {
    const pausedProducer = this.producers.find(
      (item) => item.id === producerId
    );

    try {
      await pausedProducer.pause();
    } catch (e) {
      console.log("error occureed", e);
    }
  };

  resumeProducer = async ({ producerId }) => {
    const resumedProducer = this.producers.find(
      (item) => item.id === producerId
    );

    try {
      await resumedProducer.resume();
    } catch (e) {
      console.log("error occureed", e);
    }
  };

  //webrtc media receiver related method starts here

  connectConsumer = async (
    { dtlsParameters, serverConsumerTransportId },
    callback
  ) => {
    const consumerTransportToConnect = this.consumingTransports.find(
      (item) => item.id === serverConsumerTransportId
    );

    if (!consumerTransportToConnect) {
      return callback(error);
    }

    try {
      await consumerTransportToConnect.connect({
        dtlsParameters,
      });
      callback();
    } catch (e) {
      return callback(e);
    }
  };

  consumeConsumer = async (
    { rtpCapabilities, producerId, serverConsumerTransportId, producerUid },
    callback
  ) => {
    const ConsumerTransportToConsume = this.consumingTransports.find(
      (item) => item.id === serverConsumerTransportId
    );

    if (
      this.router.router.canConsume({
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

        this.consumers.push(consumer);
      } catch (e) {
        console.log("error while consuming the transport", e.message);
        return callback(null, "can not consume this producer");
      }

      consumer.on("transportclose", () => {
        this.consumingTransports = this.consumingTransports.filter(
          (item) => item.id !== ConsumerTransportToConsume.id
        );
      });

      consumer.on("producerclose", () => {
        this.socket.emit("user-unpublished", { producerId });
        this.socket.emit("producer-closed", { producerId });

        consumer.close();

        this.consumers = consumer.filter((item) => item.id !== consumer.id);
      });

      consumer.observer.on("pause", () => {
        this.socket.emit("consumer-paused", {
          consumerId: consumer.id,
          uid: producerUid,
        });
      });

      consumer.observer.on("resume", () => {
        this.socket.emit("consumer-resume", {
          consumerId: consumer.id,
          uid: producerUid,
        });
      });

      consumer.observer.on("close", () => {
        this.consumers = consumer.filter((item) => item.id !== consumer.id);
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
  };

  resumeConsumer = async ({ consumer_id }, callback) => {
    try {
      const consumer = this.consumers.find((item) => item.id === consumer_id);

      if (!consumer.producerPaused) {
        await consumer.resume();
        return;
      }

      callback({ keepPaused: consumer.producerPaused || null });
    } catch (e) {
      console.log("error while resuming track ", e.message);
    }
  };

  consumerClosed = async ({ consumerId }) => {
    this.consumers = this.consumers.filter((item) => {
      if (consumerId === item.id) {
        item.consumer.close();
      }

      return item.id !== consumerId;
    });
  };

  //Peer properties
  socket;

  uid;

  role;

  producers = [];

  consumers = [];

  router;

  producingTransports = [];

  consumingTransports = [];

  room;

  device;

  customTypeProducers = {};
}
