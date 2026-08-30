import { RTCPeerConnection, RTCRtpCodecParameters } from "werift"
import { config } from "../../config/config"

export const OPUS_PAYLOAD_TYPE = 111

function opusCodec(): RTCRtpCodecParameters {
    return new RTCRtpCodecParameters({
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
        payloadType: OPUS_PAYLOAD_TYPE,
    })
}

export function createPeerConnection(): RTCPeerConnection {
    return new RTCPeerConnection({
        codecs: { audio: [opusCodec()] },
        iceAdditionalHostAddresses: config.media.publicIp ? [config.media.publicIp] : undefined,
        icePortRange: [config.media.udpPortMin, config.media.udpPortMax],
    })
}

export async function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return

    await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, config.media.iceGatheringTimeoutMs)
        const unsubscribe = pc.iceGatheringStateChange.subscribe((state) => {
            if (state === "complete") {
                clearTimeout(timeout)
                resolve()
            }
        })
        void unsubscribe
    })
}
