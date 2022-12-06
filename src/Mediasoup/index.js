import { createWorker } from "mediasoup";
import * as os from "os"
export const CreateWorker = async () => {
	const worker = await createWorker()

	console.log(`Worker pid is ${worker.pid}`)

	worker.on("died", (error) => {
		console.log("Mediasoup worker died due to ", error.message)
		setTimeout(() => process.exit(1), [2000])
	})



	return worker
}

export const Worker = []

export let ActiveWorkerIDX = 0

export const UpdateActiveWorkerIDX = (val) => {
	ActiveWorkerIDX = val
}

Object.keys(os.cpus()).forEach(async () => {
	Worker.push(await CreateWorker())
})



export const mediaCodecs = [
	{
		kind: 'audio',
		mimeType: 'audio/opus',
		clockRate: 48000,
		channels: 2
	},
	{
		kind: 'video',
		mimeType: 'video/VP8',
		clockRate: 90000,
		parameters:
		{
			'x-google-start-bitrate': 1000
		}
	},
	{
		kind: 'video',
		mimeType: 'video/VP9',
		clockRate: 90000,
		parameters:
		{
			'profile-id': 2,
			'x-google-start-bitrate': 1000
		}
	},
	{
		kind: 'video',
		mimeType: 'video/h264',
		clockRate: 90000,
		parameters:
		{
			'packetization-mode': 1,
			'profile-level-id': '4d0032',
			'level-asymmetry-allowed': 1,
			'x-google-start-bitrate': 1000
		}
	},
	{
		kind: 'video',
		mimeType: 'video/h264',
		clockRate: 90000,
		parameters:
		{
			'packetization-mode': 1,
			'profile-level-id': '42e01f',
			'level-asymmetry-allowed': 1,
			'x-google-start-bitrate': 1000
		}
	}
]


export let AllRouters = {}

export const UpdateRouters = (newRouters) => {
	AllRouters = newRouters
}


export const CreateWebRTCTransport = (router) => {
	return new Promise(async (resolve, reject) => {
		try {
			// https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
			const webRtcTransport_options = {
				listenIps: [
					{
						ip: '0.0.0.0',
						announcedIp: '127.0.0.1', // replace with relevant IP address
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