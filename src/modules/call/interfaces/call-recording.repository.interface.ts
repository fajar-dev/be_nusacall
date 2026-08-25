import { CallRecording } from "../entities/call-recording.entity"
import { RecordingArtifactStatus } from "../enum/recording-artifact-status.enum"

export interface ICallRecordingRepository {
    /** Creates the row if it doesn't exist yet (first of recording/transcript webhook to arrive for this call). */
    findOrCreate(callId: number, wacid: string): Promise<CallRecording>

    findByCallId(callId: number): Promise<CallRecording | null>

    /** Rows with at least one PENDING artifact, soonest-expiring first. */
    findDuePendingDownloads(limit: number): Promise<CallRecording[]>

    /** Rows with a PENDING artifact whose expiry has already passed. */
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

    updateTranscript(id: number, patch: {
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
