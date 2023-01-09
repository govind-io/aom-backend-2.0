import {
  UpdateRouters,
  AllRouters,
  defaultAudioVolumeObserverConfig,
  convertDBsTo0To100,
} from "./index.js";

export const CreateAndHandleAudioLevelObserverEvents = async ({
  mainRouterObj,
  roomname,
}) => {
  const router = mainRouterObj.router;
  const item = mainRouterObj;

  const audioLevelObserver = await router.createAudioLevelObserver(
    defaultAudioVolumeObserverConfig
  );

  console.log("created audio level observer succesfully for router ", router);

  const temp = AllRouters;

  const existingPeers = Object.keys(AllRouters[roomname].peers);

  existingPeers.forEach((elem) => {
    AllRouters[roomname].peers[elem].producers.forEach(async (elem) => {
      if (
        elem.producer.kind === "audio" &&
        item.producers.includes(elem.producer.id)
      ) {
        try {
          await audioLevelObserver.addProducer({
            producerId: elem.producer.id,
          });
        } catch (e) {
          console.log(
            "error occured while adding producer for volume observer",
            e
          );
        }
      }
    });
  });

  temp[roomname].audioLevelObserver = audioLevelObserver;

  temp[roomname].routers = temp[roomname].routers.map((routerobj) => {
    if (routerobj.router.id === router.id) {
      return { ...routerobj, audioLevelObserver };
    } else return routerobj;
  });

  UpdateRouters(temp);

  audioLevelObserver.on("volumes", (volumes) => {
    const volumesObj = {};

    volumes.forEach((item) => {
      const allPeers = Object.keys(AllRouters[roomname].peers);

      allPeers.forEach((thisUserId) => {
        const producer = AllRouters[roomname].peers[thisUserId].producers.find(
          (elem) => elem.producer.id === item.producer.id
        );

        if (producer) {
          volumesObj[thisUserId] = convertDBsTo0To100(item.volume);
        }
      });
    });

    const temp = AllRouters;

    temp[roomname].volumes = { ...temp[roomname].volumes, ...volumesObj };
    console.log(volumesObj);

    UpdateRouters(temp);
  });

  audioLevelObserver.on("silence", () => {
    const temp = AllRouters;

    console.log({ temp, roomname, volumes: temp[roomname].volumes });

    Object.keys(temp[roomname].volumes).forEach((userId) => {
      const mutedUser = temp[roomname].peers[userId].producers.find((elem) => {
        console.log({ item, elem });
        return (
          item.producers.includes(elem.producer.id) &&
          elem.producer.kind === "audio"
        );
      });

      if (mutedUser) {
        return delete temp[roomname].volumes[userId];
      }

      return;
    });

    UpdateRouters(temp);
  });

  return audioLevelObserver;
};
