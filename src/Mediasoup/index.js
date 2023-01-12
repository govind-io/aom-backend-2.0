import { createWorker } from "mediasoup";

export const CreateWorker = async () => {
  let worker;

  if (process.env.PROD === "true") {
    worker = await createWorker({
      rtcMaxPort: parseInt(process.env.RTCMAXPORT),
      rtcMinPort: parseInt(process.env.RTCMINPORT),
    });
  } else {
    worker = await createWorker();
  }

  console.log(`Worker pid is ${worker.pid}`);

  worker.on("died", (error) => {
    console.log("Mediasoup worker died due to ", error.message);
    setTimeout(() => process.exit(1), [2000]);
  });

  return worker;
};
