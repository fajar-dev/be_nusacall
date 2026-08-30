import { randomUUID } from "node:crypto"
import { ICallRepository } from "./interfaces/call.repository.interface"
import { CallStateService } from "./call-state.service"
import { CallStatus } from "./enums/call-status.enum"
import { CallDirection } from "./enums/call-direction.enum"
import { EndReason } from "./enums/end-reason.enum"
import { MetaClient } from "../../infrastructure/meta/meta.client"
import { sessionRegistry } from "../../infrastructure/media/session-registry"
import { presenceRegistry } from "../user/presence.registry"
import { RoutingService } from "../routing/routing.service"
import { NusawaLogService } from "./nusawa-log.service"
import { formatCallLogMessage } from "./call-log-message"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"
import type { IAgentNotifier, ICallSignalingNotifier, WsOutboundPacket } from "./interfaces/call-signaling.interface"
import type { Call } from "./entities/call.entity"
import { CallLogOutcome } from "./enums/call-log-outcome.enum"
import { ContactService } from "../contact/contact.service"

function packet(type: string, wacid: string, data?: unknown): WsOutboundPacket {
    return { type, wacid, data, ts: Date.now() }
}

export class CallSignalingService implements ICallSignalingNotifier {
    constructor(
        private readonly notifier: IAgentNotifier,
        private readonly callRepository: ICallRepository,
        private readonly callState: CallStateService,
        private readonly metaClient: MetaClient,
        private readonly routing: RoutingService,
        private readonly nusawaLog: NusawaLogService,
        private readonly contacts: ContactService,
    ) {}

    async notifyIncoming(call: Call): Promise<void> {
        const decision = this.routing.decide(call)

        if (decision.kind === "reject") {
            try {
                await this.metaClient.reject(call.phoneNumberId, call.wacid)
            } catch (err) {
                logger.error("Meta reject failed for no-agent-available call", { wacid: call.wacid, err })
            }
            await this.callState.transition(call.wacid, CallStatus.MISSED, {
                endReason: decision.reason ?? EndReason.NO_AGENT_AVAILABLE,
                endedAt: new Date(),
                durationSeconds: this.durationSince(call.answeredAt),
            })
            await sessionRegistry.remove(call.wacid, "no_agent_available")
            return
        }

        const transitioned = await this.callState.transition(call.wacid, CallStatus.RINGING, { ringingAt: new Date() })
        if (!transitioned) return

        for (const email of decision.targets) {
            presenceRegistry.setCurrentCall(email, call.id)
        }

        const expiresAt = Date.now() + config.call.answerTimeoutSeconds * 1000
        this.notifier.sendToAgents(
            decision.targets,
            packet("incoming_call", call.wacid, {
                phoneNumber: call.contact?.phoneNumber ?? null,
                name: call.contact?.name ?? null,
                phoneNumberId: call.phoneNumberId,
                expiresAt,
            })
        )

        setTimeout(() => this.expireIfStillRinging(call.wacid), config.call.answerTimeoutSeconds * 1000)
    }

    private async expireIfStillRinging(wacid: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        if (!call || call.status !== CallStatus.RINGING) return

        const transitioned = await this.callState.transition(wacid, CallStatus.MISSED, {
            endReason: EndReason.ANSWER_TIMEOUT,
            endedAt: new Date(),
            durationSeconds: this.durationSince(call.answeredAt),
        })
        if (!transitioned) return

        await sessionRegistry.remove(wacid, "answer_timeout")
        await this.logCallOutcome(call, CallLogOutcome.MISSED)

        const stillRinging = presenceRegistry.listAll().filter((p) => p.currentCallId === call.id)
        for (const presence of stillRinging) {
            this.notifier.send(presence.email, packet("call_ended", wacid, { endReason: EndReason.ANSWER_TIMEOUT }))
            presenceRegistry.setCurrentCall(presence.email, null)
        }
    }

    async handleAnswer(userId: number, agentEmail: string, wacid: string, offerSdp: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        const session = sessionRegistry.get(wacid)
        if (!call || !session) {
            this.notifier.send(agentEmail, packet("error", wacid, { code: "not_found", message: "Call not found" }))
            return
        }

        const claimed = await this.callState.transition(wacid, CallStatus.CONNECTING, { userId })
        if (!claimed) {
            this.notifier.send(agentEmail, packet("call_taken", wacid, { byEmail: call.user?.email ?? "unknown" }))
            presenceRegistry.setCurrentCall(agentEmail, null)
            return
        }

        this.releaseOtherRingingAgents(call, agentEmail)

        const answerSdp = await session.attachAgent(offerSdp)
        this.notifier.send(agentEmail, packet("webrtc_answer", wacid, { sdp: answerSdp }))

        try {
            await this.metaClient.accept(call.phoneNumberId, wacid, session.metaAnswerSdp!)
        } catch (err) {
            logger.error("Meta accept failed after agent answered", { wacid, err })
            await this.callState.transition(wacid, CallStatus.FAILED, {
                endReason: EndReason.MEDIA_FAILURE,
                endedAt: new Date(),
                durationSeconds: this.durationSince(call.answeredAt),
            })
            await sessionRegistry.remove(wacid, "accept_failed")
            this.notifier.send(agentEmail, packet("call_ended", wacid, { endReason: EndReason.MEDIA_FAILURE }))
            presenceRegistry.setCurrentCall(agentEmail, null)
            return
        }

        session.startForwarding()
        await this.callState.transition(wacid, CallStatus.ACTIVE, {
            answeredAt: new Date(),
            recordingEnabled: config.recording.recordingEnabled,
        })
        this.notifier.send(agentEmail, packet("call_state", wacid, { status: "active" }))
    }

    async handleReject(agentEmail: string, wacid: string, reason?: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        if (!call) return

        try {
            await this.metaClient.reject(call.phoneNumberId, wacid)
        } catch (err) {
            logger.error("Meta reject failed", { wacid, err })
        }

        await this.callState.transition(wacid, CallStatus.REJECTED, {
            endReason: EndReason.AGENT_REJECTED,
            endedAt: new Date(),
            errorMessage: reason ?? null,
            durationSeconds: this.durationSince(call.answeredAt),
        })
        await sessionRegistry.remove(wacid, "agent_rejected")
        await this.logCallOutcome(call, CallLogOutcome.REJECTED)
        this.releaseOtherRingingAgents(call, agentEmail)
        presenceRegistry.setCurrentCall(agentEmail, null)
    }

    async handleHangup(agentEmail: string, wacid: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        if (!call) return

        try {
            await this.metaClient.terminate(call.phoneNumberId, wacid)
        } catch (err) {
            logger.error("Meta terminate failed", { wacid, err })
        }

        const durationSeconds = this.durationSince(call.answeredAt)
        await this.callState.transition(wacid, CallStatus.COMPLETED, {
            endReason: EndReason.AGENT_HANGUP,
            endedAt: new Date(),
            durationSeconds,
        })
        await sessionRegistry.remove(wacid, "agent_hangup")
        await this.logCallOutcome(call, CallLogOutcome.COMPLETED, durationSeconds)
        presenceRegistry.setCurrentCall(agentEmail, null)
        this.notifier.send(agentEmail, packet("call_ended", wacid, { endReason: EndReason.AGENT_HANGUP }))
    }

    async logCallOutcome(call: Call, outcome: CallLogOutcome, durationSeconds?: number | null): Promise<void> {
        const body = formatCallLogMessage(outcome, { durationSeconds, agentEmail: call.user?.email })
        await this.nusawaLog.enqueue({ callId: call.id, phoneNumberId: call.phoneNumberId, phoneNumber: call.contact?.phoneNumber ?? "", body })
    }

    notifyCallEnded(call: Call, endReason: EndReason): void {
        const email = call.user?.email
        if (!email) return
        presenceRegistry.setCurrentCall(email, null)
        this.notifier.send(email, packet("call_ended", call.wacid, { endReason }))
    }

    notifyOutboundActive(call: Call): void {
        const email = call.user?.email
        if (!email) return
        this.notifier.send(email, packet("call_state", call.wacid, { status: "active" }))
    }

    private durationSince(start: Date | null | undefined): number {
        if (!start) return 0
        return Math.max(0, Math.round((Date.now() - start.getTime()) / 1000))
    }

    async initiateOutbound(userId: number, agentEmail: string, phoneNumberId: string, contactId: number, offerSdp: string): Promise<{ wacid: string; answerSdp: string }> {
        const contact = await this.contacts.getById(contactId)
        const tempKey = `pending.${randomUUID()}`
        const session = sessionRegistry.create(tempKey)

        let metaOfferSdp: string
        let agentAnswerSdp: string
        try {
            metaOfferSdp = await session.createMetaOffer()
            agentAnswerSdp = await session.attachAgent(offerSdp)
        } catch (err) {
            await sessionRegistry.remove(tempKey, "outbound_media_setup_failed")
            throw err
        }

        let wacid: string
        try {
            const response = await this.metaClient.connect(phoneNumberId, contact.phoneNumber, metaOfferSdp)
            wacid = response.calls?.[0]?.id ?? tempKey
        } catch (err) {
            await sessionRegistry.remove(tempKey, "outbound_connect_failed")
            throw err
        }

        sessionRegistry.rekey(tempKey, wacid)

        const call = await this.callRepository.save({
            wacid, phoneNumberId, contactId,
            direction: CallDirection.OUTBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
            userId,
        })
        presenceRegistry.setCurrentCall(agentEmail, call.id)

        return { wacid, answerSdp: agentAnswerSdp }
    }

    private releaseOtherRingingAgents(call: Call, exceptEmail: string): void {
        const stillRinging = presenceRegistry.listAll().filter((p) => p.currentCallId === call.id && p.email !== exceptEmail)
        for (const presence of stillRinging) {
            this.notifier.send(presence.email, packet("call_taken", call.wacid, { byEmail: exceptEmail }))
            presenceRegistry.setCurrentCall(presence.email, null)
        }
    }
}
