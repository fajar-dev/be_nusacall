import { CallEvent } from "../entities/call-event.entity"
import { CallEventType } from "../enum/call-event-type.enum"
import { CallEventStatus } from "../enum/call-event-status.enum"

export interface RecordEventInput {
    dedupKey: string
    wacid: string
    callId?: number | null
    eventType: CallEventType
    eventStatus?: CallEventStatus | null
    metaTimestamp?: string | null
    payload: Record<string, unknown>
    isStale: boolean
}

export interface ICallEventRepository {
    tryInsert(input: RecordEventInput): Promise<boolean>
    markProcessed(dedupKey: string, error?: string): Promise<void>
    linkToCall(wacid: string, callId: number): Promise<void>
}
