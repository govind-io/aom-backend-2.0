import { createWorker } from "mediasoup";

export const CreateWorker = async () => {
    const worker = await createWorker({
        rtcMaxPort: 2020, rtcMinPort: 2000
    })

    console.log(`Worker pid is ${worker.pid}`)

    worker.on("died", (error) => {
        console.log("Mediasoup worker died due to ", error.message)
        setTimeout(() => process.exit(1), [2000])
    })



    return worker
}

export const Worker = await CreateWorker()


export const mediaCodecs = [{
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2
}, {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
        "x-google-start-bitrate": 1000
    }
}]


export let AllRouters = {}

export const UpdateRouters = (newRouters) => {
    AllRouters = newRouters
    console.log(newRouters.gandu)
}


export const CreateWebRTCTransport = (router) => {
    return new Promise(async (resolve, reject) => {
        try {
            // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
            const webRtcTransport_options = {
                listenIps: [
                    {
                        ip: '0.0.0.0',
                        announcedIp: '192.168.1.3', // replace with relevant IP address
                    }
                ],
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
            }

            // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
            let transport = await router.createWebRtcTransport(webRtcTransport_options)


            transport.on('dtlsstatechange', dtlsState => {
                if (dtlsState === 'closed') {
                    transport.close()
                }
            })

            transport.on('close', () => {
                console.log('transport closed')
            })

            resolve(transport)

        } catch (error) {
            reject(error)
        }
    })
}