import { LessThanOrEqual, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { NusawaLogQueue } from "../entities/nusawa-log-queue.entity"
import { QueueStatus } from "../enums/queue-status.enum"
import { EnqueueLogInput, INusawaLogQueueRepository } from "../interfaces/nusawa-log-queue.repository.interface"

export class TypeOrmNusawaLogQueueRepository implements INusawaLogQueueRepository {
    private readonly repository: Repository<NusawaLogQueue>

    constructor() {
        this.repository = AppDataSource.getRepository(NusawaLogQueue)
    }

    async enqueue(input: EnqueueLogInput): Promise<NusawaLogQueue> {
        return await this.repository.save({
            callId: input.callId,
            wacid: input.wacid,
            phoneNumberId: input.phoneNumberId,
            waId: input.waId,
            body: input.body,
            status: QueueStatus.PENDING,
            attempts: 0,
            nextAttemptAt: new Date(),
        })
    }

    async findDue(limit: number): Promise<NusawaLogQueue[]> {
        return await this.repository.find({
            where: { status: QueueStatus.PENDING, nextAttemptAt: LessThanOrEqual(new Date()) },
            order: { nextAttemptAt: "ASC" },
            take: limit,
        })
    }

    async markSent(id: number): Promise<void> {
        await this.repository.update(id, { status: QueueStatus.SENT })
    }

    async markFailed(id: number, error: string, nextAttemptAt: Date | null): Promise<void> {
        if (nextAttemptAt) {
            await this.repository.increment({ id }, "attempts", 1)
            await this.repository.update(id, { lastError: error, nextAttemptAt })
        } else {
            await this.repository.update(id, { status: QueueStatus.ABANDONED, lastError: error })
        }
    }
}
