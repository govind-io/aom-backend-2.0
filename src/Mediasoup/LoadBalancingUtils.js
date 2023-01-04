import { AllRouters, Worker, mediaCodecs, UpdateRouters } from ".";
import * as os from "os";

export const ChooseRouter = async ({ roomname }) => {
  const routers = AllRouters[roomname].routers;
  let leastLoadedRouter = routers[0];
  for (let router of routers) {
    if (router.load < leastLoadedRouter.load) {
      leastLoadedRouter = router;
    }
  }

  if (
    leastLoadedRouter.load > parseInt(process.env.ROUTER_MAX_LOAD) &&
    routers.length < os.cpus().length
  ) {
    const usedWorkers = routers.map((item) => item.worker.id);
    const unusedWorker = Worker.find((item) => !usedWorkers.includes(item.id));

    if (!unusedWorker) return leastLoadedRouter;

    const newRouter = unusedWorker.createRouter({
      mediaCodecs,
    });

    const rtpCapabilities = await newRouter.rtpCapabilities;

    const temp = AllRouters;

    temp[roomname].routers.forEach(async (router) => {
      const producerRouter = router.router;

      return await router.producers.forEach(async (producerId) => {
        await producerRouter.pipeToRouter({
          producerId: producerId,
          router: newRouter,
        });
      });
    });

    temp[roomname].routers.push({
      router: newRouter,
      worker: unusedWorker,
      rtpCapabilities,
      load: 0,
      producers: [],
      consumers: [],
    });

    UpdateRouters(temp);

    return newRouter;
  }

  return leastLoadedRouter;
};

export const addLoadOnRouter = ({ roomname, routerId, type, id }) => {
  const routers = AllRouters[roomname].routers;
  for (let router of routers) {
    if (router.router.id === routerId) {
      router.load += 1;
      if (type === "producer") {
        router.producers.push(id);
      } else {
        router.consumers.push(id);
      }
      break;
    }
  }

  const temp = AllRouters;

  temp[roomname].routers = routers;

  UpdateRouters(temp);
};

export const RemoveLoadOnRouter = ({ roomname, routerId, type, id }) => {
  const routers = AllRouters[roomname].routers;
  for (let router of routers) {
    if (router.router.id === routerId) {
      router.load -= 1;
      if (type === "producer") {
        router.producers = router.producers.filter((item) => item !== id);
      } else {
        router.consumers = router.consumers.filter((item) => item !== id);
      }

      if (!router.producers.length && !router.consumers.length) {
        router.router.close();
      }
      break;
    }
  }

  const temp = AllRouters;

  temp[roomname].routers = routers;

  UpdateRouters(temp);
};

export const PipeToAllRouters = ({ roomname, producer }) => {
  const routers = AllRouters[roomname].routers;

  const producerRouter = routers.find((item) =>
    item.producers.includes(producer.id)
  );

  routers.forEach(async (item) => {
    if (item.router.id !== producerRouter.router.id) {
      await producerRouter.router.pipeToRouter({
        producerId: producer.id,
        router: item.router,
      });
    }
  });
};

export const GetTransportRouter = ({ roomname, transportId }) => {
  const routers = AllRouters[roomname].routers;

  return routers.find((item) => item.producers.includes(transportId));
};
