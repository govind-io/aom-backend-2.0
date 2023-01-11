import {
  AllRouters,
  Worker,
  mediaCodecs,
  UpdateRouters,
  ActiveWorkerIDX,
} from "./index.js";
import * as os from "os";
import { CreateAndHandleAudioLevelObserverEvents } from "./AudioLevelObserver.js";

export const addLoadOnRouter = ({ roomname, routerId }) => {
  const routers = AllRouters[roomname].routers;
  for (let router of routers) {
    if (router.router.id === routerId) {
      router.load += 1;
      break;
    }
  }

  const temp = AllRouters;

  temp[roomname].routers = routers;

  UpdateRouters(temp);
};

export const RemoveLoadOnRouter = ({ roomname, routerId }) => {
  const routers = AllRouters[roomname].routers;
  for (let router of routers) {
    if (router.router.id === routerId) {
      router.load -= 1;
      if (router.load < 1) {
        router.router.close();
      }
      break;
    }
  }

  const temp = AllRouters;

  temp[roomname].routers = routers.filter((item) => item.load >= 1);

  UpdateRouters(temp);
};

export const PipeToAllRouters = ({ roomname, producer, routerId }) => {
  const routers = AllRouters[roomname].routers;

  const producerRouter = routers.find((item) => item.router.id === routerId);

  routers.forEach(async (item) => {
    if (item.router.id !== producerRouter.router.id) {
      await producerRouter.router.pipeToRouter({
        producerId: producer.id,
        router: item.router,
      });
    }
  });
};

export const ChooseRouter = async ({ roomname }) => {
  const routers = AllRouters[roomname].routers;

  let leastLoadedRouter = routers[0];

  if (!leastLoadedRouter) {
    const newRouter = await Worker[ActiveWorkerIDX].createRouter({
      mediaCodecs,
    });

    const rtpCapabilities = await newRouter.rtpCapabilities;

    leastLoadedRouter = {
      router: newRouter,
      rtpCapabilities,
      worker: Worker[ActiveWorkerIDX],
      load: 0,
      producers: [],
      consumers: [],
      audioLevelObserver: undefined,
    };
  }

  for (let router of routers) {
    if (router.load < leastLoadedRouter.load) {
      leastLoadedRouter = router;
    }
  }

  const temp = AllRouters;

  if (
    leastLoadedRouter.load > parseInt(process.env.ROUTER_MAX_LOAD) &&
    routers.length < os.cpus().length
  ) {
    const usedWorkers = routers.map((item) => {
      return item.worker.pid;
    });

    const unusedWorker = Worker.find((item) => !usedWorkers.includes(item.pid));

    if (!unusedWorker) return leastLoadedRouter;

    const newRouter = await unusedWorker.createRouter({
      mediaCodecs,
    });

    const rtpCapabilities = await newRouter.rtpCapabilities;

    await temp[roomname].routers.forEach(async (router) => {
      const producerRouter = router.router;

      return await router.producers.forEach(async (producerId) => {
        await producerRouter.pipeToRouter({
          producerId: producerId,
          router: newRouter,
        });
      });
    });

    leastLoadedRouter = {
      router: newRouter,
      worker: unusedWorker,
      rtpCapabilities,
      load: 0,
      producers: [],
    };

    temp[roomname].routers.push(leastLoadedRouter);

    UpdateRouters(temp);

    CreateAndHandleAudioLevelObserverEvents({
      roomname: roomname,
      mainRouterObj: leastLoadedRouter,
    });
  }

  UpdateRouters(temp);

  addLoadOnRouter({ roomname, routerId: leastLoadedRouter.router.id });

  return leastLoadedRouter;
};

export const AddProducerToRouter = async ({
  roomname,
  routerId,
  producerId,
  kind,
}) => {
  const routers = AllRouters[roomname].routers;

  const temp = AllRouters;

  temp[roomname].routers = routers.map((item) => {
    if (item.router.id === routerId) {
      const localItem = item;

      localItem.producers.push(producerId);
      return localItem;
    } else return item;
  });

  console.log({ allrouters: temp[roomname].routers, routerId: routerId });

  const audioLevelObserver = temp[roomname].routers.find(
    (item) => item.router.id === routerId
  ).audioLevelObserver;

  if (audioLevelObserver && kind === "audio") {
    try {
      await audioLevelObserver.addProducer({ producerId });
    } catch (e) {
      console.log("catch error ", e);
    }
  }

  UpdateRouters(temp);
};

export const RemoveProducerToRouter = async ({
  roomname,
  routerId,
  producerId,
  kind,
}) => {
  const routers = AllRouters[roomname].routers;

  const temp = AllRouters;

  temp[roomname].routers = routers.map((item) => {
    if (item.router.id === routerId) {
      const localItem = item;

      localItem.producers = localItem.producers.filter(
        (item) => item !== producerId
      );
      return localItem;
    } else return item;
  });

  const audioLevelObserver = temp[roomname].routers.find(
    (item) => item.router.id === routerId
  ).audioLevelObserver;

  if (audioLevelObserver && kind === "audio") {
    try {
      await audioLevelObserver.removeProducer({ producerId });
    } catch (e) {
      console.log("catch error ", e);
    }
  }

  UpdateRouters(temp);
};
