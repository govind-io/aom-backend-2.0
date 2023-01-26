import { RoomRouter } from "./Routers.js";
import * as os from "os";
import { Peer } from "./Peers.js";
import {
  ActiveWorkerIDX,
  AllRouters,
  UpdateActiveWorkerIDX,
  UpdateRouters,
  Worker,
} from "./StateData.js";
import { defaultAudioVolumeObserverConfig } from "./Settings.js";
import { io } from "../App.js";

export class RTCRoom {
  constructor(name, id) {
    this.name = name;
    this.id = id;
  }

  //methods
  init = async () => {
    const roomRouter = new RoomRouter({
      roomname: this.name,
      worker: Worker[ActiveWorkerIDX],
    });

    await roomRouter.init(this);

    if (ActiveWorkerIDX === Worker.length - 1) {
      UpdateActiveWorkerIDX(0);
    } else {
      UpdateActiveWorkerIDX(ActiveWorkerIDX + 1);
    }

    this.routers.push(roomRouter);
    this.initialised = true;
  };

  //check if existing peer
  getPeer = (uid) => {
    return this.peers[uid];
  };

  createPeer = async ({ uid, socket, role }) => {
    if (!this.initialised) {
      throw new Error("Cannot create a peer before initialising the room");
    }

    const newPeer = new Peer({
      socket,
      uid,
      role,
      router: await this.choosePeerRouter(),
      room: this,
    });

    this.peers[uid] = newPeer;

    return newPeer;
  };

  removeRouter = (id) => {
    this.routers = this.routers.filter((item) => item.id !== id);

    if (this.routers.length === 0) {
      if (this.interval) {
        clearInterval(this.interval);
      }

      const temp = AllRouters;

      delete temp[this.name];

      UpdateRouters(temp);
    }
  };

  choosePeerRouter = async () => {
    let leastLoadedRouter = this.routers[0];

    if (!leastLoadedRouter) {
      await this.init();
      leastLoadedRouter = this.router[0];
    }

    this.routers.forEach((router) => {
      if (router.load < leastLoadedRouter.load) {
        leastLoadedRouter = router;
      }
    });

    if (
      leastLoadedRouter.load >= process.env.ROUTER_MAX_LOAD &&
      routers.length < os.cpus().length
    ) {
      const roomRouter = new RoomRouter({
        roomname: this.name,
        worker: this.worker[0],
      });

      await roomRouter.init(ref);

      leastLoadedRouter = roomRouter;

      this.routers.push(roomRouter);

      this.PipeAllProducersToRouter(roomRouter.router);

      if (this.audioLevelObserverEnabled) {
        await roomRouter.CreateAndHandleAudioLevelObserver();
      }
    }

    return leastLoadedRouter;
  };

  getAllProducingPeers = (uid) => {
    const peersUid = Object.keys(this.peers);

    const producingPeers = [];

    peersUid.forEach((item) => {
      const currentPeer = this.peers[item];

      if (currentPeer.producers.length > 0 && currentPeer.uid !== uid) {
        producingPeers.push(currentPeer);
      }
    });

    return producingPeers;
  };

  getAllPeers = (uid) => {
    const peersUid = Object.keys(this.peers);

    const allPeers = [];

    peersUid.forEach((item) => {
      const currentPeer = this.peers[item];

      if (currentPeer.uid !== uid) {
        allPeers.push(currentPeer);
      }
    });

    return allPeers;
  };

  PipeToAllRouters = async ({ producerRouter, producerId }) => {
    this.routers.forEach(async (item) => {
      if (item.id !== producerRouter.id) {
        await producerRouter.pipeToRouter({
          producerId: producerId,
          router: producerRouter,
        });
      }
    });
  };

  PipeAllProducersToRouter = async (router) => {
    this.peers.forEach((item) => {
      if (item.router.id === router.id) return;

      item.producers.forEach(async (producer) => {
        await item.router.router.pipeToRouter({
          producerid: producer.id,
          router: router,
        });
      });
    });
  };

  createRoomAudioLevelObserver = async () => {
    this.routers.forEach(async (item) => {
      await item.CreateAndHandleAudioLevelObserver();
    });

    this.audioLevelObserverEnabled = true;

    const interval = setInterval(() => {
      io.in(this.name).emit("volumes", this.volumes);
    }, [defaultAudioVolumeObserverConfig.interval]);

    this.interval = interval;
  };

  //properties
  id;

  initialised = false;

  audioLevelObserverEnabled = false;

  name;

  routers = [];

  //array of unused workers for this room
  workers = Worker;

  peers = {};

  volumes = {};

  interval;
}
