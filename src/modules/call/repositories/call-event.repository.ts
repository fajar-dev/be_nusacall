import { Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { CallEvent } from "../entities/call-event.entity"
import { ICallEventRepository, RecordEventInput } from "../interfaces/call-event.repository.interface"

export class TypeOrmCallEventRepository implements ICallEventRepository {
    private readonly repository: Repository<CallEvent>

    constructor() {
        this.repository = AppDataSource.getRepository(CallEvent)
    }

    async tryInsert(input: RecordEventInput): Promise<boolean> {
        try {
            await this.repository.insert({
                dedupKey: input.dedupKey,
                wacid: input.wacid,
                callId: input.callId ?? null,
                eventType: input.eventType,
                eventStatus: input.eventStatus ?? null,
                metaTimestamp: input.metaTimestamp ?? null,
                payload: input.payload as any,
                isStale: input.isStale,
            })
            return true
        } catch (err) {
            if (this.isUniqueViolation(err)) return false
            throw err
        }
    }

    async markProcessed(dedupKey: string, error?: string): Promise<void> {
        await this.repository.update(
            { dedupKey },
            { processed: !error, processingError: error ?? null }
        )
    }

    async linkToCall(wacid: string, callId: number): Promise<void> {
        await this.repository
            .createQueryBuilder()
            .update(CallEvent)
            .set({ callId })
            .where("wacid = :wacid AND callId IS NULL", { wacid })
            .execute()
    }

    private isUniqueViolation(err: unknown): boolean {
        const code = (err as { code?: string })?.code
        return code === "ER_DUP_ENTRY"
    }
}
