import { createWorker } from "mediasoup";
import * as os from "os";
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

export const Worker = [];

export let ActiveWorkerIDX = 0;

export const UpdateActiveWorkerIDX = (val) => {
  ActiveWorkerIDX = val;
};

if (process.env.PROD === "false") {
  Object.keys(os.cpus()).forEach(async () => {
    Worker.push(await CreateWorker());
  });
} else {
  Worker.push(await CreateWorker());
}

export const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
  {
    kind: "video",
    mimeType: "video/VP9",
    clockRate: 90000,
    parameters: {
      "profile-id": 2,
      "x-google-start-bitrate": 1000,
    },
  },
  {
    kind: "video",
    mimeType: "video/h264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "4d0032",
      "level-asymmetry-allowed": 1,
      "x-google-start-bitrate": 1000,
    },
  },
  {
    kind: "video",
    mimeType: "video/h264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
      "x-google-start-bitrate": 1000,
    },
  },
];

export let AllRouters = {};

export const UpdateRouters = (newRouters) => {
  AllRouters = newRouters;
};

export const CreateWebRTCTransport = (router) => {
  return new Promise(async (resolve, reject) => {
    try {
      // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
      const webRtcTransport_options = {
        listenIps: [
          {
            ip: "0.0.0.0",
            announcedIp: process.env.ANNOUNCEDIP,
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      };

      // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
      let transport = await router.createWebRtcTransport(
        webRtcTransport_options
      );

      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          transport.close();
        }
      });

      transport.on("close", () => {
        console.log("transport closed");
      });

      resolve(transport);
    } catch (error) {
      reject(error);
    }
  });
};

export const defaultAudioVolumeObserverConfig = {
  maxEntries: 50,
  threshold: -70,
  interval: 800,
};

export const convertDBsTo0To100 = function (dBs) {
  // Convert from dBs to linear scale

  var linear = Math.round(Math.pow(10, dBs / 85) * 10);

  if (linear === 1) {
    return 0;
  }

  return linear;
};
