export const convertDBsTo0To100 = function (dBs) {
  // Convert from dBs to linear scale

  var linear = Math.round(Math.pow(10, dBs / 85) * 10);

  if (linear === 1) {
    return 0;
  }

  return linear;
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

export const CreateRTPTransport = (router) => {
  return new Promise(async (resolve, reject) => {
    try {
      const RtpTransport_options = {
        listenIp: {
          ip: "0.0.0.0",
          announcedIp: process.env.ANNOUNCEDIP,
        },
        rtcpMux: true,
      };

      let transport = await router.createPlainTransport(RtpTransport_options);

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
