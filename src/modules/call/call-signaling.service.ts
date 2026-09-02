import { ICallRepository } from "./interfaces/call.repository.interface"
import { CallStateService } from "./call-state.service"
import { CallStatus } from "./enums/call-status.enum"
import { CallDirection } from "./enums/call-direction.enum"
import { EndReason } from "./enums/end-reason.enum"
import { presenceRegistry } from "../user/presence.registry"
import { RoutingService } from "../routing/routing.service"
import { NusawaLogService } from "./nusawa-log.service"
import { formatCallLogMessage } from "./call-log-message"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"
import type { IAgentNotifier, ICallSignalingNotifier, WsOutboundPacket } from "./interfaces/call-signaling.interface"
import type { IAsteriskCallControl } from "./interfaces/asterisk-call-control.interface"
import type { Call } from "./entities/call.entity"
import { CallLogOutcome } from "./enums/call-log-outcome.enum"
import { ContactService } from "../contact/contact.service"
import { IAccountRepository } from "../account/interfaces/account.repository.interface"
import { BadGatewayException, ForbiddenException, NotFoundException } from "../../core/exceptions/base"
import { PermissionService } from "../permission/permission.service"
import { PermissionStatus } from "../permission/enums/permission-status.enum"

const OUTBOUND_ERROR_MESSAGES: Record<number, string> = {
    138006: "This customer hasn't granted call permission yet — request it first.",
    138009: "Too many permission requests sent to this customer recently — try again later.",
    138012: "Daily limit of 100 business-initiated calls reached — try again tomorrow.",
    138013: "Business-initiated calling isn't available for this phone number.",
    138014: "Calling is temporarily disabled for this number due to low call quality.",
    138015: "This phone number's messaging limit is below the 2000 required for calling.",
    138017: "A permanent call permission already exists — no need to request again.",
}

function packet(type: string, wacid: string, data?: unknown): WsOutboundPacket {
    return { type, wacid, data, ts: Date.now() }
}

export class CallSignalingService implements ICallSignalingNotifier {
    constructor(
        private readonly notifier: IAgentNotifier,
        private readonly callRepository: ICallRepository,
        private readonly callState: CallStateService,
        private readonly asterisk: IAsteriskCallControl,
        private readonly routing: RoutingService,
        private readonly nusawaLog: NusawaLogService,
        private readonly contacts: ContactService,
        private readonly accounts: IAccountRepository,
        private readonly permissions?: PermissionService,
    ) {}

    async notifyIncoming(call: Call): Promise<void> {
        const decision = this.routing.decide(call)

        if (decision.kind === "reject") {
            try {
                await this.asterisk.hangupChannel(call.wacid, "busy")
            } catch (err) {
                logger.error("Asterisk hangup failed for no-agent-available call", { wacid: call.wacid, err })
            }
            await this.callState.transition(call.wacid, CallStatus.MISSED, {
                endReason: decision.reason ?? EndReason.NO_AGENT_AVAILABLE,
                endedAt: new Date(),
                durationSeconds: this.durationSince(call.answeredAt),
            })
            return
        }

        const transitioned = await this.callState.transition(call.wacid, CallStatus.RINGING, { ringingAt: new Date() })
        if (!transitioned) return

        for (const email of decision.targets) {
            if (presenceRegistry.get(email)?.currentCallId === null) {
                presenceRegistry.setCurrentCall(email, call.id)
            }
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

        try {
            await this.asterisk.hangupChannel(wacid, "no_answer")
        } catch (err) {
            logger.error("Asterisk hangup failed for a call that timed out unanswered", { wacid, err })
        }

        const transitioned = await this.callState.transition(wacid, CallStatus.MISSED, {
            endReason: EndReason.ANSWER_TIMEOUT,
            endedAt: new Date(),
            durationSeconds: this.durationSince(call.answeredAt),
        })
        if (!transitioned) return

        await this.logCallOutcome(call, CallLogOutcome.MISSED)

        const stillRinging = presenceRegistry.listAll().filter((p) => p.currentCallId === call.id)
        for (const presence of stillRinging) {
            this.notifier.send(presence.email, packet("call_ended", wacid, { endReason: EndReason.ANSWER_TIMEOUT }))
            presenceRegistry.setCurrentCall(presence.email, null)
        }
    }

    async handleAnswer(userId: number, agentEmail: string, wacid: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        if (!call) {
            this.notifier.send(agentEmail, packet("error", wacid, { code: "not_found", message: "Call not found" }))
            return
        }

        const claimed = await this.callState.transition(wacid, CallStatus.CONNECTING, { userId })
        if (!claimed) {
            this.notifier.send(agentEmail, packet("call_taken", wacid, { byEmail: call.user?.email ?? "unknown" }))
            presenceRegistry.setCurrentCall(agentEmail, null)
            return
        }

        presenceRegistry.setCurrentCall(agentEmail, call.id)
        this.releaseOtherRingingAgents(call, agentEmail)

        try {
            await this.asterisk.connectAgent(wacid, userId)
        } catch (err) {
            logger.error("Failed calling the agent softphone", { wacid, userId, err })
            await this.callState.transition(wacid, CallStatus.FAILED, {
                endReason: EndReason.MEDIA_FAILURE,
                endedAt: new Date(),
                durationSeconds: this.durationSince(call.answeredAt),
            })
            this.notifier.send(agentEmail, packet("call_ended", wacid, { endReason: EndReason.MEDIA_FAILURE }))
            presenceRegistry.setCurrentCall(agentEmail, null)
            return
        }

        await this.callState.transition(wacid, CallStatus.ACTIVE, {
            answeredAt: new Date(),
            recordingEnabled: config.recording.recordingEnabled,
        })
        this.notifier.send(agentEmail, packet("call_state", wacid, { status: "active" }))
    }

    async handleReject(agentEmail: string, wacid: string, reason?: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        if (!call) return

        if (call.status !== CallStatus.RINGING) {
            this.notifier.send(agentEmail, packet("call_taken", wacid, { byEmail: call.user?.email ?? "unknown" }))
            presenceRegistry.setCurrentCall(agentEmail, null)
            return
        }

        try {
            await this.asterisk.hangupChannel(wacid, "rejected")
        } catch (err) {
            logger.error("Asterisk hangup failed", { wacid, err })
        }

        await this.callState.transition(wacid, CallStatus.REJECTED, {
            endReason: EndReason.AGENT_REJECTED,
            endedAt: new Date(),
            errorMessage: reason ?? null,
            durationSeconds: this.durationSince(call.answeredAt),
        })
        await this.logCallOutcome(call, CallLogOutcome.REJECTED)
        this.releaseOtherRingingAgents(call, agentEmail)
        presenceRegistry.setCurrentCall(agentEmail, null)
    }

    async handleHangup(agentEmail: string, wacid: string): Promise<void> {
        const call = await this.callRepository.findByWacid(wacid)
        if (!call) return

        try {
            await this.asterisk.hangupChannel(wacid, "normal")
        } catch (err) {
            logger.error("Asterisk hangup failed", { wacid, err })
        }

        const wasConnected = call.status === CallStatus.ACTIVE
        const durationSeconds = this.durationSince(call.answeredAt)
        await this.callState.transition(wacid, wasConnected ? CallStatus.COMPLETED : CallStatus.ABANDONED, {
            endReason: EndReason.AGENT_HANGUP,
            endedAt: new Date(),
            durationSeconds,
        })
        if (wasConnected) {
            await this.logCallOutcome(call, CallLogOutcome.COMPLETED, durationSeconds)
        }
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

    async initiateOutbound(userId: number, agentEmail: string, phoneNumberId: string, contactId: number): Promise<{ wacid: string }> {
        const contact = await this.contacts.getById(contactId)
        const account = await this.accounts.findByPhoneNumberId(phoneNumberId)
        if (!account) throw new NotFoundException("Account not found")

        if (account.isOfficial !== false && this.permissions) {
            const { permission } = await this.permissions.checkPermission(phoneNumberId, contactId)
            const hasPermission = permission.status === PermissionStatus.PERMANENT
                || (permission.status === PermissionStatus.TEMPORARY && (!permission.expiresAt || permission.expiresAt > new Date()))
            if (!hasPermission) {
                throw new ForbiddenException("No active call permission for this customer — request permission first")
            }
        }

        try {
            const { wacid } = await this.asterisk.originateOutbound(account, contact.phoneNumber)

            const call = await this.callRepository.save({
                wacid, phoneNumberId, contactId,
                direction: CallDirection.OUTBOUND,
                status: CallStatus.PENDING,
                statusRank: 10,
                userId,
            })
            presenceRegistry.setCurrentCall(agentEmail, call.id)

            return { wacid }
        } catch (err) {
            const code = (err as { context?: { code?: number } })?.context?.code
            if (code && OUTBOUND_ERROR_MESSAGES[code]) {
                throw new BadGatewayException(OUTBOUND_ERROR_MESSAGES[code], { code })
            }
            throw err
        }
    }

    private releaseOtherRingingAgents(call: Call, exceptEmail: string): void {
        const stillRinging = presenceRegistry.listAll().filter((p) => p.currentCallId === call.id && p.email !== exceptEmail)
        for (const presence of stillRinging) {
            this.notifier.send(presence.email, packet("call_taken", call.wacid, { byEmail: exceptEmail }))
            presenceRegistry.setCurrentCall(presence.email, null)
        }
    }
}
