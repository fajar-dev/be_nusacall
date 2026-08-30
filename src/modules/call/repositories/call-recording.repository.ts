import { AppDataSource } from "../../../config/database"
import { CallRecording } from "../entities/call-recording.entity"
import { ICallRecordingRepository, StoreRecordingInput } from "../interfaces/call-recording.repository.interface"

export class TypeOrmCallRecordingRepository implements ICallRecordingRepository {
    private readonly repository = AppDataSource.getRepository(CallRecording)

    async findByCallId(callId: number): Promise<CallRecording | null> {
        return await this.repository.findOne({ where: { callId } })
    }

    async store(input: StoreRecordingInput): Promise<CallRecording> {
        const existing = await this.findByCallId(input.callId)
        if (existing) {
            this.repository.merge(existing, input)
            return await this.repository.save(existing)
        }
        return await this.repository.save(this.repository.create(input))
    }
}
