import { CallEvent } from "../entities/call-event.entity"

export interface RecordEventInput {
    dedupKey: string
    wacid: string
    callId?: number | null
    eventType: string
    eventStatus?: string | null
    metaTimestamp?: string | null
    payload: Record<string, unknown>
    isStale: boolean
}

export interface ICallEventRepository {
    /**
     * Inserts the event iff `dedupKey` doesn't already exist. Returns false (no throw) when
     * it's a duplicate — this is the idempotency mechanism itself, not a side detail of it.
     */
    tryInsert(input: RecordEventInput): Promise<boolean>

    markProcessed(dedupKey: string, error?: string): Promise<void>

    linkToCall(wacid: string, callId: number): Promise<void>
}
