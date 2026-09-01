import { ariClient, type AriStasisStartEvent, type AriStasisEndEvent, type AriChannelStateChangeEvent } from "../../infrastructure/asterisk/ari.client"
import { AsteriskRtpLeg } from "../../infrastructure/media/asterisk-rtp-leg"
import { sessionRegistry } from "../../infrastructure/media/session-registry"
import { CallStateService } from "./call-state.service"
import { ICallRepository } from "./interfaces/call.repository.interface"
import { ContactService } from "../contact/contact.service"
import { IAccountRepository } from "../account/interfaces/account.repository.interface"
import { IAsteriskCallControl } from "./interfaces/asterisk-call-control.interface"
import type { ICallSignalingNotifier } from "./interfaces/call-signaling.interface"
import { Account } from "../account/entities/account.entity"
import { CallStatus, isTerminalCallStatus } from "./enums/call-status.enum"
import { CallDirection } from "./enums/call-direction.enum"
import { EndReason } from "./enums/end-reason.enum"
import { CallLogOutcome } from "./enums/call-log-outcome.enum"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"

interface PendingBridge {
    bridgeId: string
    externalMediaChannelId: string
}

/**
 * Menggantikan peran webhook Meta + CallMediaCoordinator untuk mode SIP:
 * mendengarkan event ARI (StasisStart/StasisEnd/ChannelStateChange) dari
 * Asterisk dan mengelola bridge + leg media untuk tiap panggilan.
 */
export class AsteriskCallHandlerService implements IAsteriskCallControl {
    private signaling: ICallSignalingNotifier | null = null
    private readonly bridges = new Map<string, PendingBridge>()

    constructor(
        private readonly callState: CallStateService,
        private readonly calls: ICallRepository,
        private readonly contacts: ContactService,
        private readonly accounts: IAccountRepository,
    ) {}

    /** Dependensi melingkar dengan CallSignalingService dipecah lewat setter, sama seperti attachBoardListener/attachService di modul lain. */
    attachSignaling(signaling: ICallSignalingNotifier): void {
        this.signaling = signaling
    }

    start(): void {
        ariClient.onStasisStart((event) => {
            this.handleStasisStart(event).catch((err) => {
                logger.error("Failed handling ARI StasisStart", { channelId: event.channel.id, err })
            })
        })
        ariClient.onStasisEnd((event) => {
            this.handleStasisEnd(event).catch((err) => {
                logger.error("Failed handling ARI StasisEnd", { channelId: event.channel.id, err })
            })
        })
        ariClient.onChannelStateChange((event) => {
            this.handleChannelStateChange(event).catch((err) => {
                logger.error("Failed handling ARI ChannelStateChange", { channelId: event.channel.id, err })
            })
        })
        ariClient.connect()
    }

    private async handleStasisStart(event: AriStasisStartEvent): Promise<void> {
        const [kind] = event.args
        if (kind === "inbound") {
            await this.handleInboundStart(event)
        } else if (kind === "outbound") {
            await this.handleOutboundStart(event)
        }
        // Channel externalMedia sendiri juga singgah di Stasis tanpa arg yang dikenali — dibiarkan, cukup dibridge.
    }

    private async handleInboundStart(event: AriStasisStartEvent): Promise<void> {
        const wacid = event.channel.id
        const phoneNumberId = event.args[1]

        if (!phoneNumberId) {
            logger.error("Inbound SIP call missing phoneNumberId arg — hanging up", { wacid })
            await ariClient.hangupChannel(wacid, "normal").catch(() => {})
            return
        }

        const account = await this.accounts.findByPhoneNumberId(phoneNumberId)
        if (!account) {
            logger.error("Inbound SIP call for unknown phoneNumberId — hanging up", { wacid, phoneNumberId })
            await ariClient.hangupChannel(wacid, "normal").catch(() => {})
            return
        }

        const contact = await this.contacts.findOrCreate(event.channel.caller.number, null)

        const call = await this.callState.findOrCreate(wacid, {
            phoneNumberId,
            contactId: contact.id,
            direction: CallDirection.INBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
        })

        try {
            const bridge = await this.setupBridge(wacid)
            this.bridges.set(wacid, bridge)
            await ariClient.ringChannel(wacid)
        } catch (err) {
            await this.failSetup(wacid, err)
            return
        }

        await this.signaling?.notifyIncoming(call)
    }

    private async handleOutboundStart(event: AriStasisStartEvent): Promise<void> {
        const wacid = event.channel.id
        if (!sessionRegistry.get(wacid)) {
            logger.warn("Outbound SIP channel entered Stasis with no matching media session", { wacid })
            return
        }

        try {
            const bridge = await this.setupBridge(wacid)
            this.bridges.set(wacid, bridge)
            await ariClient.addChannelToBridge(bridge.bridgeId, wacid)
        } catch (err) {
            await this.failSetup(wacid, err)
        }
        // Forwarding baru dimulai saat channel benar-benar "Up" — lihat handleChannelStateChange.
    }

    private async failSetup(wacid: string, err: unknown): Promise<void> {
        logger.error("Failed preparing SIP call media", { wacid, err })
        await this.callState.transition(wacid, CallStatus.FAILED, {
            endReason: EndReason.MEDIA_FAILURE,
            endedAt: new Date(),
            errorMessage: err instanceof Error ? err.message : String(err),
        })
        await ariClient.hangupChannel(wacid, "congestion").catch(() => {})
        await sessionRegistry.remove(wacid, "sip_media_setup_failed")
    }

    private async setupBridge(wacid: string): Promise<PendingBridge> {
        const session = sessionRegistry.create(wacid)
        const rtpLeg = await AsteriskRtpLeg.bind()
        session.attachAsteriskLeg(rtpLeg)

        const bridge = await ariClient.createBridge()
        const externalMediaChannel = await ariClient.createExternalMedia({
            app: config.asterisk.ariApp,
            externalHost: `${config.asterisk.externalMediaHost}:${rtpLeg.localPort}`,
        })
        await ariClient.addChannelToBridge(bridge.id, externalMediaChannel.id)

        return { bridgeId: bridge.id, externalMediaChannelId: externalMediaChannel.id }
    }

    private async handleChannelStateChange(event: AriChannelStateChangeEvent): Promise<void> {
        if (event.channel.state !== "Up") return
        const wacid = event.channel.id
        if (!this.bridges.has(wacid)) return

        const call = await this.calls.findByWacid(wacid)
        if (!call || call.direction !== CallDirection.OUTBOUND || call.status === CallStatus.ACTIVE) return

        const session = sessionRegistry.get(wacid)
        if (!session) return

        session.startForwarding()
        const transitioned = await this.callState.transition(wacid, CallStatus.ACTIVE, {
            answeredAt: new Date(),
            recordingEnabled: config.recording.recordingEnabled,
        })
        if (transitioned && this.signaling) {
            const updated = await this.calls.findByWacid(wacid)
            if (updated) this.signaling.notifyOutboundActive(updated)
        }
    }

    async acceptCall(wacid: string): Promise<void> {
        const pending = this.bridges.get(wacid)
        if (!pending) throw new Error(`No pending bridge for call ${wacid}`)
        await ariClient.answerChannel(wacid)
        await ariClient.addChannelToBridge(pending.bridgeId, wacid)
    }

    async hangupChannel(wacid: string, reason?: string): Promise<void> {
        try {
            await ariClient.hangupChannel(wacid, reason)
        } catch (err) {
            logger.warn("Hangup via ARI failed (channel may already be gone)", { wacid, err })
        }
    }

    async originateOutbound(account: Account, calleeNumber: string): Promise<{ wacid: string }> {
        const channel = await ariClient.originateChannel({
            endpoint: `PJSIP/${calleeNumber}@meta-${account.phoneNumberId}`,
            app: config.asterisk.ariApp,
            appArgs: "outbound",
        })
        return { wacid: channel.id }
    }

    private async handleStasisEnd(event: AriStasisEndEvent): Promise<void> {
        const wacid = event.channel.id
        const pending = this.bridges.get(wacid)
        this.bridges.delete(wacid)
        if (pending) {
            await ariClient.destroyBridge(pending.bridgeId).catch(() => {})
        }

        const call = await this.calls.findByWacid(wacid)
        if (!call || isTerminalCallStatus(call.status)) {
            await sessionRegistry.remove(wacid, "stasis_end")
            return
        }

        const endedAt = new Date()
        const terminalStatus = this.resolveTerminalState(call.status)
        const durationSeconds = this.elapsedSeconds(call.answeredAt, endedAt)
        const endReason = terminalStatus === CallStatus.COMPLETED ? EndReason.CUSTOMER_HANGUP
            : terminalStatus === CallStatus.REJECTED ? EndReason.CUSTOMER_REJECTED
            : EndReason.MEDIA_FAILURE

        const transitioned = await this.callState.transition(wacid, terminalStatus, { endedAt, endReason, durationSeconds })
        await sessionRegistry.remove(wacid, "stasis_end")

        if (transitioned && this.signaling) {
            const outcome = terminalStatus === CallStatus.COMPLETED ? CallLogOutcome.COMPLETED
                : terminalStatus === CallStatus.REJECTED ? CallLogOutcome.REJECTED
                : CallLogOutcome.MISSED
            const updated = { ...call, endedAt, endReason, durationSeconds }
            await this.signaling.logCallOutcome(updated, outcome, durationSeconds)
            this.signaling.notifyCallEnded(updated, endReason)
        }
    }

    private resolveTerminalState(currentStatus: CallStatus): CallStatus {
        if (currentStatus === CallStatus.ACTIVE) return CallStatus.COMPLETED
        if (currentStatus === CallStatus.RINGING || currentStatus === CallStatus.CONNECTING) return CallStatus.ABANDONED
        return CallStatus.FAILED
    }

    private elapsedSeconds(answeredAt: Date | null | undefined, endedAt: Date): number {
        if (!answeredAt) return 0
        return Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000))
    }
}
