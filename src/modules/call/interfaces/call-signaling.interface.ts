import { Call } from "../entities/call.entity"
import { CallLogOutcome } from "../call-log-message"

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
}
