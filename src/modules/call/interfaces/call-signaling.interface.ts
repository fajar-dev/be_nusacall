import { Call } from "../entities/call.entity"
import { CallLogOutcome } from "../call-log-message"
import { EndReason } from "../enums/end-reason.enum"

export interface WsOutboundPacket {
    type: string
    wacid?: string
    callId?: number
    data?: unknown
    ts: number
}

export interface IAgentNotifier {
    send(email: string, packet: WsOutboundPacket): void
    sendToAgents(emails: string[], packet: WsOutboundPacket): void
    broadcast(packet: WsOutboundPacket): void
}

export interface ICallSignalingNotifier {
    notifyIncoming(call: Call): Promise<void>
    logCallOutcome(call: Call, outcome: CallLogOutcome, durationSeconds?: number | null): Promise<void>
    notifyCallEnded(call: Call, endReason: EndReason): void
    notifyOutboundActive(call: Call): void
}
