import { RTCPeerConnection, RTCRtpCodecParameters } from "werift"
import { config } from "../../config/config"

/**
 * Builds an RTCPeerConnection meeting Meta's mandatory media requirements
 * (docs/INTEGRATION-META.md §6): Opus/48kHz, single audio m-line, one fixed
 * SSRC per transceiver. werift's default cert (ECDSA P-256) and DTLS role
 * negotiation need no extra config — confirmed in the Fase 0 spike.
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
    })
}

/**
 * Waits for ICE gathering to complete before the SDP is sent onward. This is
 * NOT optional: Graph API's pre_accept/accept/connect are one-shot HTTP
 * calls — there is no channel for trickled ICE candidates afterward.
 * See: docs/INTEGRATION-META.md §5.1, docs/MEDIA-PLANE.md §5.
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
