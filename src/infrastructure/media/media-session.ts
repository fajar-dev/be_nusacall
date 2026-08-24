import { RTCPeerConnection, RTCRtpTransceiver, RtpPacket, RtpHeader } from "werift"
import { createPeerConnection, waitForIceGatheringComplete, OPUS_PAYLOAD_TYPE } from "./peer-factory"
import { ensurePtime20, assertValidOutboundSdp } from "./sdp-transformer"
import { logger } from "../../core/helpers/logger"
import { config } from "../../config/config"

export interface MediaStats {
    packetsToMeta: number
    packetsToAgent: number
    lastPacketToMetaAt: Date | null
    lastPacketToAgentAt: Date | null
}

/**
 * One MediaSession = one call = two WebRTC legs bridged together
 * (Meta <-> NusaCall <-> Agent). See docs/MEDIA-PLANE.md §5-6.
 *
 * Lifecycle: acceptMetaOffer() (Meta leg) → attachAgent() (browser leg) →
 * startForwarding() (only after Meta's `accept` returns 200) → close().
 */
export class MediaSession {
    readonly wacid: string
    readonly createdAt: Date = new Date()

    private legA: RTCPeerConnection | null = null // Meta
    private legB: RTCPeerConnection | null = null // Agent browser
    private transceiverA: RTCRtpTransceiver | null = null
    private transceiverB: RTCRtpTransceiver | null = null

    private forwardingStarted = false
    private closed = false
    private closeTimer: ReturnType<typeof setTimeout> | null = null

    /** The SDP answer sent to Meta via pre_accept. MUST be resent byte-identical to `accept`. */
    metaAnswerSdp: string | null = null

    readonly stats: MediaStats = {
        packetsToMeta: 0,
        packetsToAgent: 0,
        lastPacketToMetaAt: null,
        lastPacketToAgentAt: null,
    }

    constructor(wacid: string) {
        this.wacid = wacid
        // Absolute safety net against a leaked session outliving its call.
        this.closeTimer = setTimeout(
            () => this.close("session_max_duration_exceeded"),
            config.media.sessionMaxDurationMinutes * 60 * 1000
        )
    }

    /**
     * Applies Meta's SDP offer (from the `connect` webhook) and produces the
     * SDP answer to send via pre_accept. ICE gathering completes before
     * returning — Graph API has no channel for trickled candidates.
     */
    async acceptMetaOffer(offerSdp: string): Promise<string> {
        if (this.closed) throw new Error(`MediaSession ${this.wacid} is already closed`)

        this.legA = createPeerConnection()
        this.transceiverA = this.legA.addTransceiver("audio", { direction: "sendrecv" })

        // MUST subscribe before negotiation — werift fires onTrack during
        // SDP negotiation, not lazily on first packet (see SPIKE-RESULTS.md §3.4).
        this.transceiverA.onTrack.subscribe((track) => {
            track.onReceiveRtp.subscribe((rtp) => this.forwardToAgent(rtp))
        })

        await this.legA.setRemoteDescription({ type: "offer", sdp: offerSdp })
        const answer = await this.legA.createAnswer()
        await this.legA.setLocalDescription(answer)
        await waitForIceGatheringComplete(this.legA)

        let finalSdp = this.legA.localDescription!.sdp
        finalSdp = ensurePtime20(finalSdp)
        assertValidOutboundSdp(finalSdp)

        this.metaAnswerSdp = finalSdp
        return finalSdp
    }

    /**
     * Applies the agent browser's SDP offer and returns our answer. Can be
     * called concurrently with / after acceptMetaOffer — the two legs are
     * independent until startForwarding() wires them together.
     */
    async attachAgent(offerSdp: string): Promise<string> {
        if (this.closed) throw new Error(`MediaSession ${this.wacid} is already closed`)

        this.legB = createPeerConnection()
        this.transceiverB = this.legB.addTransceiver("audio", { direction: "sendrecv" })

        this.transceiverB.onTrack.subscribe((track) => {
            track.onReceiveRtp.subscribe((rtp) => this.forwardToMeta(rtp))
        })

        await this.legB.setRemoteDescription({ type: "offer", sdp: offerSdp })
        const answer = await this.legB.createAnswer()
        await this.legB.setLocalDescription(answer)
        await waitForIceGatheringComplete(this.legB)

        return ensurePtime20(this.legB.localDescription!.sdp)
    }

    /**
     * Enables RTP forwarding. Must only be called AFTER Meta's `accept`
     * succeeds — earlier risks audio clipping. See docs/MEDIA-PLANE.md §5.
     */
    startForwarding(): void {
        if (this.closed) return
        this.forwardingStarted = true
        logger.info("Media forwarding started", { wacid: this.wacid })
    }

    private forwardToAgent(rtp: RtpPacket): void {
        if (!this.forwardingStarted || !this.transceiverB || this.closed) return
        const fwd = new RtpPacket(
            new RtpHeader({ sequenceNumber: rtp.header.sequenceNumber, timestamp: rtp.header.timestamp, payloadType: OPUS_PAYLOAD_TYPE }),
            rtp.payload
        )
        this.transceiverB.sender.sendRtp(fwd).catch((err) => {
            logger.error("Failed forwarding RTP to agent leg", { wacid: this.wacid, err })
        })
        this.stats.packetsToAgent++
        this.stats.lastPacketToAgentAt = new Date()
    }

    private forwardToMeta(rtp: RtpPacket): void {
        if (!this.forwardingStarted || !this.transceiverA || this.closed) return
        const fwd = new RtpPacket(
            new RtpHeader({ sequenceNumber: rtp.header.sequenceNumber, timestamp: rtp.header.timestamp, payloadType: OPUS_PAYLOAD_TYPE }),
            rtp.payload
        )
        this.transceiverA.sender.sendRtp(fwd).catch((err) => {
            logger.error("Failed forwarding RTP to Meta leg", { wacid: this.wacid, err })
        })
        this.stats.packetsToMeta++
        this.stats.lastPacketToMetaAt = new Date()
    }

    async close(reason: string): Promise<void> {
        if (this.closed) return
        this.closed = true
        this.forwardingStarted = false

        if (this.closeTimer) clearTimeout(this.closeTimer)

        logger.info("Closing media session", { wacid: this.wacid, reason, stats: this.stats })

        try {
            this.legA?.close()
        } catch (err) {
            logger.warn("Error closing Meta leg", { wacid: this.wacid, err })
        }
        try {
            this.legB?.close()
        } catch (err) {
            logger.warn("Error closing agent leg", { wacid: this.wacid, err })
        }
    }

    get isClosed(): boolean {
        return this.closed
    }
}
