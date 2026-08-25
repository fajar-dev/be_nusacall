import { Call } from "../entities/call.entity"
import { CallLogOutcome } from "../call-log-message"
import { EndReason } from "../enum/end-reason.enum"

export interface WsOutboundPacket {
    type: string
    wacid?: string
    callId?: number
    data?: unknown
    ts: number
}

/** Implemented by SignalingGateway — lets CallSignalingService push to agents without knowing about WebSockets. */
export interface IAgentNotifier {
    send(email: string, packet: WsOutboundPacket): void
    sendToAgents(emails: string[], packet: WsOutboundPacket): void
}

/** Implemented by CallSignalingService — lets WebhookService trigger ringing/logging without knowing about routing/WS/nusawa. */
export interface ICallSignalingNotifier {
    notifyIncoming(call: Call): Promise<void>

    /** Queues a call-outcome message into the nusawa thread. */
    logCallOutcome(call: Call, outcome: CallLogOutcome, durationSeconds?: number | null): Promise<void>

    /**
     * Tells the answering agent's browser the call is over and frees their presence, for
     * terminal states Meta/nusawa report themselves (customer hangup, FAILED) that the
     * agent-initiated paths never see. No-op if no agent had answered.
     */
    notifyCallEnded(call: Call, endReason: EndReason): void

    /** Tells the initiating agent's browser the call is now active, mirroring the `call_state: active` packet handleAnswer already sends. */
    notifyOutboundActive(call: Call): void
}
