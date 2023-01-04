import { AllRouters, Worker, mediaCodecs, UpdateRouters } from "./index.js";
import * as os from "os";

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
  console.log("choose router called");
  const routers = AllRouters[roomname].routers;
  let leastLoadedRouter = routers[0];
  for (let router of routers) {
    if (router.load < leastLoadedRouter.load) {
      leastLoadedRouter = router;
    }
  }

  console.log(
    parseInt(process.env.ROUTER_MAX_LOAD),
    leastLoadedRouter.load,
    routers.length,
    leastLoadedRouter.load > parseInt(process.env.ROUTER_MAX_LOAD) &&
      routers.length < os.cpus().length,
    "here is the requirement"
  );

  const temp = AllRouters;

  if (
    leastLoadedRouter.load > parseInt(process.env.ROUTER_MAX_LOAD) &&
    routers.length < os.cpus().length
  ) {
    console.log("inside if block");
    const usedWorkers = routers.map((item) => {
      return item.worker.pid;
    });
    console.log(usedWorkers, "used workers");
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

    console.log("new router returned");

    temp[roomname].routers.push(leastLoadedRouter);

    UpdateRouters(temp);
  }

  UpdateRouters(temp);

  addLoadOnRouter({ roomname, routerId: leastLoadedRouter.router.id });

  return leastLoadedRouter;
};

export const AddProducerToRouter = ({ roomname, routerId, producerId }) => {
  const routers = AllRouters[roomname].routers;

  const temp = AllRouters;

  temp[roomname].routers = routers.map((item) => {
    if (item.router.id === routerId) {
      const localItem = item;

      localItem.producers.push(producerId);
      return localItem;
    } else return item;
  });

  UpdateRouters(temp);
};

export const RemoveProducerToRouter = ({ roomname, routerId, producerId }) => {
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

  UpdateRouters(temp);
};
