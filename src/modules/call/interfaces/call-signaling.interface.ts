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
    send(username: string, packet: WsOutboundPacket): void
    sendToAgents(usernames: string[], packet: WsOutboundPacket): void
}

/** Implemented by CallSignalingService — lets WebhookService trigger ringing/logging without knowing about routing/WS/nusawa. */
export interface ICallSignalingNotifier {
    notifyIncoming(call: Call): Promise<void>

    /** Queues a call-outcome message into the nusawa thread (docs/INTEGRATION-NUSAWA.md §3.5). */
    logCallOutcome(call: Call, outcome: CallLogOutcome, durationSeconds?: number | null): Promise<void>

    /**
     * Tells the answering agent's browser the call is over and frees their
     * presence — for terminal states nusawa/Meta itself reports (customer
     * hangup, FAILED, etc), which the agent-initiated hangup/reject paths
     * never see. No-ops if no agent had answered yet.
     */
    notifyCallEnded(call: Call, endReason: EndReason): void

    /** Fase 3 (BIC) — tells the initiating agent's browser the call is now active, mirroring the `call_state: active` packet UIC's handleAnswer already sends. */
    notifyOutboundActive(call: Call): void
}
