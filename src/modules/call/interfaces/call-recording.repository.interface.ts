import { CallRecording } from "../entities/call-recording.entity"
import { RecordingArtifactStatus } from "../enums/recording-artifact-status.enum"

export interface ICallRecordingRepository {
    findOrCreate(callId: number, wacid: string): Promise<CallRecording>
    findByCallId(callId: number): Promise<CallRecording | null>
    findDuePendingDownloads(limit: number): Promise<CallRecording[]>
    findExpiredPending(now: Date): Promise<CallRecording[]>
    updateRecording(id: number, patch: {
        status: RecordingArtifactStatus
        mediaId?: string | null
        sha256?: string | null
        mimeType?: string | null
        s3Key?: string | null
        availableAt?: Date | null
        expiresAt?: Date | null
        error?: string | null
    }): Promise<void>
}
