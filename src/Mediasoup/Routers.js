import { defaultAudioVolumeObserverConfig, mediaCodecs } from "./Settings.js";
import { convertDBsTo0To100 } from "./Utils.js";

export class RoomRouter {
  constructor({ roomname, worker }) {
    this.roomname = roomname;
    this.worker = worker;
  }

  //methods here
  init = async (ref) => {
    const newRouter = await this.worker.createRouter({
      mediaCodecs,
    });

    this.router = newRouter;

    this.rtpCapabilities = await newRouter.rtpCapabilities;

    this.room = ref;

    this.id = newRouter.id;

    this.room.workers = this.room.workers.filter(
      (item) => item.pid !== this.worker.pid
    );
  };

  addLoad = (uid, peer) => {
    this.peers[uid] = peer;
    this.load = this.load + 1;
  };

  removeLoad = (uid) => {
    delete this.peers[uid];
    this.load = this.load - 1;

    if (Object.keys(this.peers).length === 0) {
      this.close();
    }
  };

  close = () => {
    this.router.close();
    this.room.removeRouter(this.id);
    this.room.workers.push(this.worker);
  };

  CreateAndHandleAudioLevelObserver = async () => {
    let audioLevelObserver;

    try {
      audioLevelObserver = await this.router.createAudioLevelObserver(
        defaultAudioVolumeObserverConfig
      );
    } catch (e) {
      console.log(this.router.id);
      return console.log("error occured ", e);
    }

    const allPeers = Object.keys(this.peers);

    allPeers.forEach(async (item) => {
      this.peers[item].producers.forEach(async (elem) => {
        if (elem.kind === "audio") {
          await audioLevelObserver.addProducer({
            producerId: elem.id,
          });
        }
      });
    });

    this.audioLevelObserver = audioLevelObserver;

    audioLevelObserver.on("volumes", (volumes) => {
      const volumesObj = {};

      volumes.forEach((item) => {
        const allPeers = Object.keys(this.peers);

        allPeers.forEach((thisUserId) => {
          const producer = this.peers[thisUserId].producers.find(
            (elem) => elem.id === item.producer.id
          );

          if (producer) {
            volumesObj[thisUserId] = convertDBsTo0To100(item.volume);
          }
        });
      });

      this.room.volumes = { ...this.room.volumes, ...volumesObj };
    });

    audioLevelObserver.on("silence", () => {
      const mutedUsersId = Object.keys(this.peers);

      mutedUsersId.forEach((item) => delete this.room.volumes[item]);
    });
  };

  peers = {};

  roomname;

  router;

  worker;

  load;

  rtpCapabilities;

  audioLevelObserver;

  room;

  id;
}
