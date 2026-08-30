import { INusawaLogQueueRepository } from "./interfaces/nusawa-log-queue.repository.interface"
import { NusawaClient } from "../../infrastructure/nusawa/nusawa.client"
import { logger } from "../../core/helpers/logger"

const BACKOFF_SECONDS = [5, 30, 120, 600, 3600]

export class NusawaLogService {
    constructor(
        private readonly queue: INusawaLogQueueRepository,
        private readonly nusawaClient: NusawaClient,
    ) {}

    async enqueue(input: { callId: number; wacid: string; phoneNumberId: string; waId: string; body: string }): Promise<void> {
        await this.queue.enqueue(input)
    }

    async flushDue(limit = 50): Promise<{ sent: number; failed: number }> {
        const due = await this.queue.findDue(limit)
        let sent = 0
        let failed = 0

        for (const row of due) {
            const ok = await this.nusawaClient.logCallMessage({
                phoneNumberId: row.phoneNumberId,
                wacid: row.wacid,
                to: row.waId,
                body: row.body,
            })

            if (ok) {
                await this.queue.markSent(row.id)
                sent++
                continue
            }

            failed++
            const nextDelaySeconds = BACKOFF_SECONDS[row.attempts]
            const nextAttemptAt = nextDelaySeconds ? new Date(Date.now() + nextDelaySeconds * 1000) : null
            await this.queue.markFailed(row.id, "nusawa logCallMessage returned non-2xx or timed out", nextAttemptAt)
            if (!nextAttemptAt) {
                logger.warn("nusawa call log abandoned after max attempts", { queueId: row.id, wacid: row.wacid })
            }
        }

        return { sent, failed }
    }
}
