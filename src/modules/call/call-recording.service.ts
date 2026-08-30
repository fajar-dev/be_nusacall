import { createHash } from "node:crypto"
import { MetaClient } from "../../infrastructure/meta/meta.client"
import { ICallRecordingRepository } from "./interfaces/call-recording.repository.interface"
import { RecordingArtifactStatus } from "./enums/recording-artifact-status.enum"
import { CallRecording } from "./entities/call-recording.entity"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"
import { NotFoundException, GoneException } from "../../core/exceptions/base"

export interface IObjectStorage {
    upload(objectName: string, buffer: Buffer, contentType: string): Promise<string>
    getPresignedUrl(objectName: string, expirySeconds?: number): Promise<string>
}

export interface RecordingAvailablePayload {
    callId: number
    wacid: string
    mediaId: string
    sha256: string
    mimeType: string
    url: string
}

export class CallRecordingService {
    constructor(
        private readonly repository: ICallRecordingRepository,
        private readonly metaClient: MetaClient,
        private readonly storage: IObjectStorage,
    ) {}

    async recordingAvailable(payload: RecordingAvailablePayload): Promise<void> {
        const row = await this.repository.findOrCreate(payload.callId, payload.wacid)
        if (row.recordingStatus !== RecordingArtifactStatus.PENDING || row.recordingMediaId) {
            logger.info("Duplicate call_recording_available ignored", { wacid: payload.wacid })
            return
        }
        const availableAt = new Date()
        await this.repository.updateRecording(row.id, {
            status: RecordingArtifactStatus.PENDING,
            mediaId: payload.mediaId,
            sha256: payload.sha256,
            mimeType: payload.mimeType,
            availableAt,
            expiresAt: this.addRetentionDays(availableAt),
        })
    }

    async getRecordingUrl(callId: number): Promise<string> {
        const row = await this.repository.findByCallId(callId)
        return this.storage.getPresignedUrl(this.readyS3Key(row))
    }

    private readyS3Key(row: CallRecording | null): string {
        const status = row?.recordingStatus
        if (!row || !status) throw new NotFoundException("No recording for this call")
        if (status === RecordingArtifactStatus.EXPIRED) throw new GoneException("This recording expired before it could be downloaded")
        if (status !== RecordingArtifactStatus.STORED || !row.recordingS3Key) {
            throw new NotFoundException(`recording is not ready yet (status: ${status})`)
        }
        return row.recordingS3Key
    }

    async processDueDownloads(limit = 20): Promise<void> {
        const rows = await this.repository.findDuePendingDownloads(limit)
        for (const row of rows) {
            if (row.recordingStatus === RecordingArtifactStatus.PENDING && row.recordingMediaId) {
                await this.downloadOne(row)
            }
        }
    }

    async markExpired(): Promise<void> {
        const rows = await this.repository.findExpiredPending(new Date())
        for (const row of rows) {
            if (row.recordingStatus === RecordingArtifactStatus.PENDING && row.recordingExpiresAt && row.recordingExpiresAt < new Date()) {
                logger.error("Call recording expired before download — permanently lost", { wacid: row.wacid, callId: row.callId })
                await this.repository.updateRecording(row.id, { status: RecordingArtifactStatus.EXPIRED })
            }
        }
    }

    private async downloadOne(row: CallRecording): Promise<void> {
        try {
            const media = await this.metaClient.getMediaUrl(row.recordingMediaId!)
            const bytes = await this.metaClient.downloadMedia(media.url)

            const actualSha256 = createHash("sha256").update(bytes).digest("hex")
            if (row.recordingSha256 && actualSha256 !== row.recordingSha256) {
                throw new Error(`SHA-256 mismatch: expected ${row.recordingSha256}, got ${actualSha256}`)
            }

            const mimeType = row.recordingMimeType ?? media.mime_type
            const key = this.objectKey(row, mimeType)
            await this.storage.upload(key, bytes, mimeType)

            await this.repository.updateRecording(row.id, { status: RecordingArtifactStatus.STORED, s3Key: key, error: null })

            logger.info("Call recording downloaded and stored", { wacid: row.wacid, key })
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error("Failed downloading call recording", { wacid: row.wacid, err })
            await this.repository.updateRecording(row.id, { status: RecordingArtifactStatus.PENDING, error: message })
        }
    }

    private objectKey(row: CallRecording, mimeType: string): string {
        const date = row.createdAt ?? new Date()
        const y = date.getUTCFullYear()
        const m = String(date.getUTCMonth() + 1).padStart(2, "0")
        const d = String(date.getUTCDate()).padStart(2, "0")
        const ext = mimeType.includes("opus") ? "ogg" : "audio"
        return `recordings/${y}/${m}/${d}/${row.wacid}-recording.${ext}`
    }

    private addRetentionDays(from: Date): Date {
        return new Date(from.getTime() + config.recording.metaRetentionDays * 24 * 60 * 60 * 1000)
    }
}
