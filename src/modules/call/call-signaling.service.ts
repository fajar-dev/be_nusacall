import { ICallRepository } from "./interfaces/call.repository.interface"
import { CallStateService } from "./call-state.service"
import { CallStatus } from "./enum/call-status.enum"
import { EndReason } from "./enum/end-reason.enum"
import { MetaClient } from "../../infrastructure/meta/meta.client"
import { NusawaClient } from "../../infrastructure/nusawa/nusawa.client"
import { unwrapNullString } from "../../infrastructure/nusawa/nusawa.types"
import { sessionRegistry } from "../../infrastructure/media/session-registry"
import { presenceRegistry } from "../agent/presence.registry"
import { RoutingService, ContactContext } from "../routing/routing.service"
import { NusawaLogService } from "./nusawa-log.service"
import { formatCallLogMessage, CallLogOutcome } from "./call-log-message"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"
import type { IAgentNotifier, ICallSignalingNotifier, WsOutboundPacket } from "./interfaces/call-signaling.interface"
import type { Call } from "./entities/call.entity"

function packet(type: string, wacid: string, data?: unknown): WsOutboundPacket {
    return { type, wacid, data, ts: Date.now() }
}

/**
 * Orchestrates the live-call signaling flow (docs/API-SPEC.md §8.5): looks
 * up caller context, rings targeted agents, wires an answering agent's SDP
 * into the MediaSession, drives Meta's `accept`/`reject`/`terminate`, logs
 * the outcome to nusawa, and keeps Call state in sync. The gateway
 * (transport) and this service (business logic) are split per
 * docs/ARCHITECTURE.md — the gateway never touches the database directly.
 */
export class CallSignalingService implements ICallSignalingNotifier {
    constructor(
        private readonly notifier: IAgentNotifier,
        private readonly callRepository: ICallRepository,
        private readonly callState: CallStateService,
        private readonly metaClient: MetaClient,
        private readonly routing: RoutingService,
        private readonly nusawaClient: NusawaClient,
        private readonly nusawaLog: NusawaLogService,
    ) {}

    async notifyIncoming(call: Call): Promise<void> {
        const context = await this.lookupContext(call)
        const decision = this.routing.decide(call, context)

        if (decision.kind === "reject") {
            await this.callState.transition(call.wacid, CallStatus.MISSED, {
                endReason: decision.reason ?? EndReason.NO_AGENT_AVAILABLE,
                endedAt: new Date(),
            })
            await sessionRegistry.remove(call.wacid, "no_agent_available")
            return
        }

        const transitioned = await this.callState.transition(call.wacid, CallStatus.RINGING, { ringingAt: new Date() })
        if (!transitioned) return // stale/out-of-order — already moved past RINGING

        for (const username of decision.targets) {
            presenceRegistry.setCurrentCall(username, call.id)
        }

        const expiresAt = Date.now() + config.call.answerTimeoutSeconds * 1000
        this.notifier.sendToAgents(
            decision.targets,
            packet("incoming_call", call.wacid, {
                waId: call.waId,
                contactName: context?.contactName ?? call.contactName,
                profileName: call.profileName,
                phoneNumberId: call.phoneNumberId,
                displayPhoneNumber: call.displayPhoneNumber,
                lastMessage: context?.lastMessage ?? null,
                tags: context?.tags ?? [],
                nusawaThreadUrl: context?.nusawaThreadUrl ?? null,
                isPicMatch: decision.kind === "direct",
                expiresAt,
            })
        )

        setTimeout(() => this.expireIfStillRinging(call.wacid), config.call.answerTimeoutSeconds * 1000)
    }

    /**
     * Identifies the caller and, if a ticket exists, the freshest PIC
     * assignment (docs/INTEGRATION-NUSAWA.md §3.3-3.4 — the second lookup is
     * deliberately NOT cached, PIC can change between the two calls). Never
     * throws: NusawaClient's call-path methods already degrade to null.
     */
    private async lookupContext(call: Call): Promise<ContactContext | null> {
        try {
            const found = await this.nusawaClient.findInboxByContact(call.phoneNumberId, call.waId)
            if (!found) return null

            const fresh = await this.nusawaClient.getInboxDetail(found.id)
            const picUsername = unwrapNullString(fresh?.username ?? found.username)

            return {
                inboxId: found.id,
                contactName: found.contact?.name ?? null,
                lastMessage: unwrapNullString(found.last_sent_message),
                tags: found.tags ?? [],
                picUsername,
                nusawaThreadUrl: config.nusawa.webUrl ? `${config.nusawa.webUrl}/inbox/${found.id}` : null,
            }
        } catch (err) {
            // Belt-and-suspenders: NusawaClient's call-path methods are
            // documented to never throw, but a call must never be blocked
            // by nusawa regardless of whether that contract holds.
            logger.warn("nusawa contact lookup failed unexpectedly — proceeding without context", { wacid: call.wacid, err })
            return null
        }
    }

    /** Nobody answered in time — release ringing agents and mark the call MISSED. */
    private async expireIfStillRinging(wacid: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        if (!call || call.status !== CallStatus.RINGING) return

        const transitioned = await this.callState.transition(wacid, CallStatus.MISSED, {
            endReason: EndReason.ANSWER_TIMEOUT,
            endedAt: new Date(),
        })
        if (!transitioned) return

        await sessionRegistry.remove(wacid, "answer_timeout")
        await this.logCallOutcome(call, "missed")

        const stillRinging = presenceRegistry.listAll().filter((p) => p.currentCallId === call.id)
        for (const presence of stillRinging) {
            this.notifier.send(presence.username, packet("call_ended", wacid, { endReason: EndReason.ANSWER_TIMEOUT }))
            presenceRegistry.setCurrentCall(presence.username, null)
        }
    }

    async handleAnswer(agentUsername: string, wacid: string, offerSdp: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        const session = sessionRegistry.get(wacid)
        if (!call || !session) {
            this.notifier.send(agentUsername, packet("error", wacid, { code: "not_found", message: "Call not found" }))
            return
        }

        const claimed = await this.callState.transition(wacid, CallStatus.CONNECTING, { agentUsername })
        if (!claimed) {
            this.notifier.send(agentUsername, packet("call_taken", wacid, { byUsername: call.agentUsername ?? "unknown" }))
            presenceRegistry.setCurrentCall(agentUsername, null)
            return
        }

        this.releaseOtherRingingAgents(call, agentUsername)

        const answerSdp = await session.attachAgent(offerSdp)
        this.notifier.send(agentUsername, packet("webrtc_answer", wacid, { sdp: answerSdp }))

        try {
            await this.metaClient.accept(call.phoneNumberId, wacid, session.metaAnswerSdp!)
        } catch (err) {
            logger.error("Meta accept failed after agent answered", { wacid, err })
            await this.callState.transition(wacid, CallStatus.FAILED, { endReason: EndReason.MEDIA_FAILURE, endedAt: new Date() })
            await sessionRegistry.remove(wacid, "accept_failed")
            this.notifier.send(agentUsername, packet("call_ended", wacid, { endReason: EndReason.MEDIA_FAILURE }))
            presenceRegistry.setCurrentCall(agentUsername, null)
            return
        }

        session.startForwarding()
        await this.callState.transition(wacid, CallStatus.ACTIVE, { answeredAt: new Date() })
        this.notifier.send(agentUsername, packet("call_state", wacid, { status: "active" }))
    }

    async handleReject(agentUsername: string, wacid: string, reason?: string): Promise<void> {
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
        })
        await sessionRegistry.remove(wacid, "agent_rejected")
        await this.logCallOutcome(call, "rejected")
        this.releaseOtherRingingAgents(call, agentUsername)
        presenceRegistry.setCurrentCall(agentUsername, null)
    }

    async handleHangup(agentUsername: string, wacid: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        if (!call) return

        try {
            await this.metaClient.terminate(call.phoneNumberId, wacid)
        } catch (err) {
            logger.error("Meta terminate failed", { wacid, err })
        }

        await this.callState.transition(wacid, CallStatus.COMPLETED, {
            endReason: EndReason.AGENT_HANGUP,
            endedAt: new Date(),
        })
        await sessionRegistry.remove(wacid, "agent_hangup")
        await this.logCallOutcome(call, "completed", this.durationSince(call.answeredAt))
        presenceRegistry.setCurrentCall(agentUsername, null)
        this.notifier.send(agentUsername, packet("call_ended", wacid, { endReason: EndReason.AGENT_HANGUP }))
    }

    /** Used by WebhookService for terminal states nusawa itself reports (customer hangup, FAILED, etc). */
    async logCallOutcome(call: Call, outcome: CallLogOutcome, durationSeconds?: number | null): Promise<void> {
        const body = formatCallLogMessage(outcome, { durationSeconds, agentUsername: call.agentUsername })
        await this.nusawaLog.enqueue({ callId: call.id, wacid: call.wacid, phoneNumberId: call.phoneNumberId, waId: call.waId, body })
    }

    private durationSince(start: Date | null | undefined): number | null {
        if (!start) return null
        return Math.max(0, Math.round((Date.now() - start.getTime()) / 1000))
    }

    /** Tells agents who were rung but didn't win (or the call ended before anyone answered) to stop ringing. */
    private releaseOtherRingingAgents(call: Call, exceptUsername: string): void {
        const stillRinging = presenceRegistry.listAll().filter((p) => p.currentCallId === call.id && p.username !== exceptUsername)
        for (const presence of stillRinging) {
            this.notifier.send(presence.username, packet("call_taken", call.wacid, { byUsername: exceptUsername }))
            presenceRegistry.setCurrentCall(presence.username, null)
        }
    }
}
