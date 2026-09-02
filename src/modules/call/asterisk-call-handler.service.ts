import { ariClient, type AriStasisStartEvent, type AriStasisEndEvent } from "../../infrastructure/asterisk/ari.client"
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
import { toE164 } from "../../core/helpers/phone-number"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"

interface ActiveCall {
    bridgeId: string
    customerChannelId: string
    agentChannelId: string | null
    recordingName: string | null
}

export class AsteriskCallHandlerService implements IAsteriskCallControl {
    private signaling: ICallSignalingNotifier | null = null
    private readonly active = new Map<string, ActiveCall>()
    private readonly agentChannelToWacid = new Map<string, string>()

    constructor(
        private readonly callState: CallStateService,
        private readonly calls: ICallRepository,
        private readonly contacts: ContactService,
        private readonly accounts: IAccountRepository,
    ) {}

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
        ariClient.connect()
    }

    private async handleStasisStart(event: AriStasisStartEvent): Promise<void> {
        const [kind] = event.args
        if (kind === "inbound") {
            await this.handleInboundStart(event)
        } else if (kind === "agent") {
            await this.handleAgentStart(event)
        } else if (kind === "outbound") {
            await this.handleOutboundCustomerStart(event)
        }
    }

    private async handleInboundStart(event: AriStasisStartEvent): Promise<void> {
        const wacid = event.channel.id
        const phoneNumberId = event.args[1]

        if (!phoneNumberId) {
            logger.error("Inbound SIP call missing phoneNumberId arg — hanging up", { wacid })
            await this.hangupChannel(wacid, "normal")
            return
        }

        const account = await this.accounts.findByPhoneNumberId(phoneNumberId)
        if (!account) {
            logger.error("Inbound SIP call for unknown phoneNumberId — hanging up", { wacid, phoneNumberId })
            await this.hangupChannel(wacid, "normal")
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

        await ariClient.ringChannel(wacid).catch((err) => {
            logger.warn("Failed to send ringing indication", { wacid, err })
        })

        await this.signaling?.notifyIncoming(call)
    }

    private async handleAgentStart(event: AriStasisStartEvent): Promise<void> {
        const agentChannelId = event.channel.id
        const wacid = this.agentChannelToWacid.get(agentChannelId)
        if (!wacid) {
            logger.warn("Agent channel entered Stasis without a matching call", { agentChannelId })
            await this.hangupChannel(agentChannelId, "normal")
            return
        }
        this.agentChannelToWacid.delete(agentChannelId)

        try {
            const bridge = await ariClient.createBridge()
            await ariClient.addChannelToBridge(bridge.id, agentChannelId)
            await ariClient.addChannelToBridge(bridge.id, wacid)
            await ariClient.answerChannel(wacid)

            const entry: ActiveCall = {
                bridgeId: bridge.id,
                customerChannelId: wacid,
                agentChannelId,
                recordingName: null,
            }

            if (config.recording.recordingEnabled) {
                const recordingName = `nusacall-${wacid}`
                await ariClient.recordBridge(bridge.id, recordingName)
                entry.recordingName = recordingName
            }

            this.active.set(wacid, entry)

            const call = await this.calls.findByWacid(wacid)
            if (call?.direction === CallDirection.OUTBOUND) {
                await this.callState.transition(wacid, CallStatus.ACTIVE, {
                    answeredAt: new Date(),
                    recordingEnabled: config.recording.recordingEnabled,
                })
            }
        } catch (err) {
            logger.error("Failed bridging agent to customer", { wacid, agentChannelId, err })
            await this.hangupChannel(agentChannelId, "normal")
            await this.failCall(wacid, err)
        }
    }

    private async handleOutboundCustomerStart(event: AriStasisStartEvent): Promise<void> {
        const wacid = event.channel.id
        const call = await this.calls.findByWacid(wacid)
        if (!call) {
            logger.warn("Outbound customer channel entered Stasis with no call row", { wacid })
            return
        }
        if (call.userId) {
            await this.connectAgent(wacid, call.userId)
        }
    }

    private async failCall(wacid: string, err: unknown): Promise<void> {
        await this.callState.transition(wacid, CallStatus.FAILED, {
            endReason: EndReason.MEDIA_FAILURE,
            endedAt: new Date(),
            errorMessage: err instanceof Error ? err.message : String(err),
        })
        await this.hangupChannel(wacid, "congestion")
    }

    async connectAgent(wacid: string, userId: number): Promise<void> {
        const channel = await ariClient.originateChannel({
            endpoint: `PJSIP/agent-${userId}`,
            app: config.asterisk.ariApp,
            appArgs: "agent",
            timeoutSeconds: config.call.answerTimeoutSeconds,
        })
        this.agentChannelToWacid.set(channel.id, wacid)
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
            endpoint: `PJSIP/${toE164(calleeNumber)}@meta-${account.phoneNumberId}`,
            app: config.asterisk.ariApp,
            appArgs: "outbound",
        })
        return { wacid: channel.id }
    }

    private async handleStasisEnd(event: AriStasisEndEvent): Promise<void> {
        const channelId = event.channel.id
        this.agentChannelToWacid.delete(channelId)

        const entry = this.active.get(channelId)
        if (entry) {
            this.active.delete(channelId)
            if (entry.agentChannelId) {
                await this.hangupChannel(entry.agentChannelId, "normal")
            }
            await ariClient.destroyBridge(entry.bridgeId).catch(() => {})
        }

        const call = await this.calls.findByWacid(channelId)
        if (!call || isTerminalCallStatus(call.status)) {
            return
        }

        const endedAt = new Date()
        const terminalStatus = this.resolveTerminalState(call.status)
        const durationSeconds = this.elapsedSeconds(call.answeredAt, endedAt)
        const endReason = terminalStatus === CallStatus.COMPLETED
            ? EndReason.CUSTOMER_HANGUP
            : terminalStatus === CallStatus.REJECTED
                ? EndReason.CUSTOMER_REJECTED
                : EndReason.MEDIA_FAILURE

        const transitioned = await this.callState.transition(channelId, terminalStatus, {
            endedAt,
            endReason,
            durationSeconds,
        })

        if (transitioned && this.signaling) {
            const outcome = terminalStatus === CallStatus.COMPLETED
                ? CallLogOutcome.COMPLETED
                : terminalStatus === CallStatus.REJECTED
                    ? CallLogOutcome.REJECTED
                    : CallLogOutcome.MISSED
            const updated = { ...call, endedAt, endReason, durationSeconds }
            await this.signaling.logCallOutcome(updated, outcome, durationSeconds)
            this.signaling.notifyCallEnded(updated, endReason)
        }
    }

    private resolveTerminalState(currentStatus: CallStatus): CallStatus {
        if (currentStatus === CallStatus.ACTIVE) {
            return CallStatus.COMPLETED
        }
        if (currentStatus === CallStatus.RINGING || currentStatus === CallStatus.CONNECTING) {
            return CallStatus.ABANDONED
        }
        return CallStatus.FAILED
    }

    private elapsedSeconds(answeredAt: Date | null | undefined, endedAt: Date): number {
        if (!answeredAt) {
            return 0
        }
        return Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000))
    }
}
