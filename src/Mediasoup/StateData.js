import * as os from "os";
import { CreateWorker } from "./index.js";

export let ActiveWorkerIDX = 0;

export const UpdateActiveWorkerIDX = (val) => {
  ActiveWorkerIDX = val;
};

export let AllRouters = {};

export const UpdateRouters = (newRouters) => {
  AllRouters = newRouters;
};

export const Worker = [];

if (process.env.PROD === "false") {
  Object.keys(os.cpus()).forEach(async () => {
    Worker.push(await CreateWorker());
  });
} else {
  Worker.push(await CreateWorker());
}
