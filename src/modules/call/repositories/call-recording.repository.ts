import { Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { CallRecording } from "../entities/call-recording.entity"
import { RecordingArtifactStatus } from "../enum/recording-artifact-status.enum"
import { ICallRecordingRepository } from "../interfaces/call-recording.repository.interface"

export class TypeOrmCallRecordingRepository implements ICallRecordingRepository {
    private readonly repository: Repository<CallRecording>

    constructor() {
        this.repository = AppDataSource.getRepository(CallRecording)
    }

    async findOrCreate(callId: number, wacid: string): Promise<CallRecording> {
        const existing = await this.repository.findOne({ where: { callId } })
        if (existing) return existing

        try {
            return await this.repository.save(this.repository.create({ callId, wacid }))
        } catch (err) {
            // Race: both *_available webhooks landed concurrently and tried to create the row —
            // the unique index rejects the loser, so re-read instead of failing.
            if (this.isUniqueViolation(err)) {
                const winner = await this.repository.findOne({ where: { callId } })
                if (winner) return winner
            }
            throw err
        }
    }

    async findByCallId(callId: number): Promise<CallRecording | null> {
        return this.repository.findOne({ where: { callId } })
    }

    async findDuePendingDownloads(limit: number): Promise<CallRecording[]> {
        return this.repository
            .createQueryBuilder("cr")
            .where("cr.recordingStatus = :pending OR cr.transcriptStatus = :pending", { pending: RecordingArtifactStatus.PENDING })
            .orderBy("LEAST(COALESCE(cr.recordingExpiresAt, cr.transcriptExpiresAt), COALESCE(cr.transcriptExpiresAt, cr.recordingExpiresAt))", "ASC")
            .limit(limit)
            .getMany()
    }

    async findExpiredPending(now: Date): Promise<CallRecording[]> {
        return this.repository
            .createQueryBuilder("cr")
            .where("(cr.recordingStatus = :pending AND cr.recordingExpiresAt IS NOT NULL AND cr.recordingExpiresAt < :now)")
            .orWhere("(cr.transcriptStatus = :pending AND cr.transcriptExpiresAt IS NOT NULL AND cr.transcriptExpiresAt < :now)")
            .setParameters({ pending: RecordingArtifactStatus.PENDING, now })
            .getMany()
    }

    async updateRecording(id: number, patch: Parameters<ICallRecordingRepository["updateRecording"]>[1]): Promise<void> {
        await this.repository.update(id, {
            recordingStatus: patch.status,
            ...(patch.mediaId !== undefined ? { recordingMediaId: patch.mediaId } : {}),
            ...(patch.sha256 !== undefined ? { recordingSha256: patch.sha256 } : {}),
            ...(patch.mimeType !== undefined ? { recordingMimeType: patch.mimeType } : {}),
            ...(patch.s3Key !== undefined ? { recordingS3Key: patch.s3Key } : {}),
            ...(patch.availableAt !== undefined ? { recordingAvailableAt: patch.availableAt } : {}),
            ...(patch.expiresAt !== undefined ? { recordingExpiresAt: patch.expiresAt } : {}),
            ...(patch.error !== undefined ? { recordingError: patch.error } : {}),
        })
    }

    async updateTranscript(id: number, patch: Parameters<ICallRecordingRepository["updateTranscript"]>[1]): Promise<void> {
        await this.repository.update(id, {
            transcriptStatus: patch.status,
            ...(patch.mediaId !== undefined ? { transcriptMediaId: patch.mediaId } : {}),
            ...(patch.sha256 !== undefined ? { transcriptSha256: patch.sha256 } : {}),
            ...(patch.mimeType !== undefined ? { transcriptMimeType: patch.mimeType } : {}),
            ...(patch.s3Key !== undefined ? { transcriptS3Key: patch.s3Key } : {}),
            ...(patch.availableAt !== undefined ? { transcriptAvailableAt: patch.availableAt } : {}),
            ...(patch.expiresAt !== undefined ? { transcriptExpiresAt: patch.expiresAt } : {}),
            ...(patch.error !== undefined ? { transcriptError: patch.error } : {}),
        })
    }

    private isUniqueViolation(err: unknown): boolean {
        const code = (err as { code?: string })?.code
        return code === "ER_DUP_ENTRY"
    }
}
