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
 * One MediaSession = one call = two WebRTC legs bridged together (legA/Meta <-> NusaCall <-> legB/Agent browser).
 * Lifecycle: acceptMetaOffer() → attachAgent() → startForwarding() (only after Meta's `accept` returns 200) → close().
 */
export class MediaSession {
    wacid: string
    readonly createdAt: Date = new Date()

    private legA: RTCPeerConnection | null = null
    private legB: RTCPeerConnection | null = null
    private transceiverA: RTCRtpTransceiver | null = null
    private transceiverB: RTCRtpTransceiver | null = null

    private forwardingStarted = false
    private closed = false
    private closeTimer: ReturnType<typeof setTimeout> | null = null

    metaAnswerSdp: string | null = null
    metaOfferSdp: string | null = null

    readonly stats: MediaStats = {
        packetsToMeta: 0,
        packetsToAgent: 0,
        lastPacketToMetaAt: null,
        lastPacketToAgentAt: null,
    }

    constructor(wacid: string) {
        this.wacid = wacid
        this.closeTimer = setTimeout(
            () => this.close("session_max_duration_exceeded"),
            config.media.sessionMaxDurationMinutes * 60 * 1000
        )
    }

    /**
     * Without this, a leg that never completes ICE looks identical in the logs to
     * one that works — both just report zero packets when the session closes.
     */
    private traceIce(pc: RTCPeerConnection, leg: "meta" | "agent"): void {
        pc.iceConnectionStateChange.subscribe((state) => {
            logger.info("ICE state changed", { wacid: this.wacid, leg, state })
        })
    }

    /** The c= and a=candidate lines actually offered to the peer, so a wrong advertised IP is visible. */
    private logCandidates(sdp: string, leg: "meta" | "agent" | "meta-remote"): void {
        const lines = sdp.split(/\r?\n/).filter((l) => l.startsWith("a=candidate:") || l.startsWith("c="))
        logger.info("Local ICE candidates", { wacid: this.wacid, leg, lines })
    }

    async acceptMetaOffer(offerSdp: string): Promise<string> {
        if (this.closed) throw new Error(`MediaSession ${this.wacid} is already closed`)

        this.legA = createPeerConnection()
        this.traceIce(this.legA, "meta")
        this.transceiverA = this.legA.addTransceiver("audio", { direction: "sendrecv" })

        this.transceiverA.onTrack.subscribe((track) => {
            track.onReceiveRtp.subscribe((rtp) => this.forwardToAgent(rtp))
        })

        this.logCandidates(offerSdp, "meta-remote")
        await this.legA.setRemoteDescription({ type: "offer", sdp: offerSdp })
        const answer = await this.legA.createAnswer()
        await this.legA.setLocalDescription(answer)
        await waitForIceGatheringComplete(this.legA)

        let finalSdp = this.legA.localDescription!.sdp
        finalSdp = ensurePtime20(finalSdp)
        assertValidOutboundSdp(finalSdp)

        this.metaAnswerSdp = finalSdp
        this.logCandidates(finalSdp, "meta")
        return finalSdp
    }

    /**
     * Business-initiated calls: WE create the offer here; Meta relays the WhatsApp
     * user's answer back via a `connect` webhook, applied via applyMetaAnswer().
     */
    async createMetaOffer(): Promise<string> {
        if (this.closed) throw new Error(`MediaSession ${this.wacid} is already closed`)

        this.legA = createPeerConnection()
        this.transceiverA = this.legA.addTransceiver("audio", { direction: "sendrecv" })

        this.transceiverA.onTrack.subscribe((track) => {
            track.onReceiveRtp.subscribe((rtp) => this.forwardToAgent(rtp))
        })

        const offer = await this.legA.createOffer()
        await this.legA.setLocalDescription(offer)
        await waitForIceGatheringComplete(this.legA)

        const finalSdp = ensurePtime20(this.legA.localDescription!.sdp)
        assertValidOutboundSdp(finalSdp)
        this.metaOfferSdp = finalSdp
        return finalSdp
    }

    /** Completes the BIC negotiation once Meta relays the user's SDP answer. */
    async applyMetaAnswer(answerSdp: string): Promise<void> {
        if (this.closed) throw new Error(`MediaSession ${this.wacid} is already closed`)
        if (!this.legA) throw new Error(`MediaSession ${this.wacid} has no Meta leg to apply an answer to`)
        await this.legA.setRemoteDescription({ type: "answer", sdp: answerSdp })
    }

    /** Can be called concurrently with / after acceptMetaOffer — the two legs are independent until startForwarding() wires them together. */
    async attachAgent(offerSdp: string): Promise<string> {
        if (this.closed) throw new Error(`MediaSession ${this.wacid} is already closed`)

        this.legB = createPeerConnection()
        this.traceIce(this.legB, "agent")
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

    /** Must only be called AFTER Meta's `accept` succeeds — earlier risks audio clipping. */
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
