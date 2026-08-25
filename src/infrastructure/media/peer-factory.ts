import { RTCPeerConnection, RTCRtpCodecParameters } from "werift"
import { config } from "../../config/config"

/**
 * Builds an RTCPeerConnection meeting Meta's mandatory media requirements:
 * Opus/48kHz, single audio m-line, one fixed SSRC per transceiver.
 */
export const OPUS_PAYLOAD_TYPE = 111

export function opusCodec(): RTCRtpCodecParameters {
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
        // Without this, werift only gathers private host candidates (NAT/Docker/cloud
        // VM), unreachable from Meta or the browser — and no STUN server is configured.
        iceAdditionalHostAddresses: config.media.publicIp ? [config.media.publicIp] : undefined,
        // Pins RTP traffic to MEDIA_UDP_PORT_MIN..MAX so a NAT/router port-forward
        // rule targeting that range actually covers it.
        icePortRange: [config.media.udpPortMin, config.media.udpPortMax],
    })
}

/**
 * NOT optional: Graph API's pre_accept/accept/connect are one-shot HTTP calls —
 * there is no channel for trickled ICE candidates afterward.
 */
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
        // werift's Event type doesn't expose an `once` helper; the timeout
        // above is the real safety net if gathering never reports complete.
        void unsubscribe
    })
}
