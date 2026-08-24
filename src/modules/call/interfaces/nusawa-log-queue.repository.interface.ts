import { NusawaLogQueue } from "../entities/nusawa-log-queue.entity"

export interface EnqueueLogInput {
    callId: number
    wacid: string
    phoneNumberId: string
    waId: string
    body: string
}

export interface INusawaLogQueueRepository {
    enqueue(input: EnqueueLogInput): Promise<NusawaLogQueue>

    /** Rows due for a (re)send attempt, oldest first. */
    findDue(limit: number): Promise<NusawaLogQueue[]>

    markSent(id: number): Promise<void>

    /** Reschedules for retry, or marks abandoned once `maxAttempts` is reached. */
    markFailed(id: number, error: string, nextAttemptAt: Date | null): Promise<void>
}
