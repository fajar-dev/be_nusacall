import { createHash } from "node:crypto"
import { MetaClient } from "../../infrastructure/meta/meta.client"
import { ICallRecordingRepository } from "./interfaces/call-recording.repository.interface"
import { RecordingArtifactStatus } from "./enum/recording-artifact-status.enum"
import { CallRecording } from "./entities/call-recording.entity"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"
import { NotFoundException, GoneException } from "../../core/exceptions/base"

/** The MinioHelper methods this service needs — injected so tests don't hit a real bucket. */
export interface IObjectStorage {
    upload(objectName: string, buffer: Buffer, contentType: string): Promise<string>
    getPresignedUrl(objectName: string, expirySeconds?: number): Promise<string>
    download(objectName: string): Promise<Buffer>
}

export interface RecordingAvailablePayload {
    callId: number
    wacid: string
    mediaId: string
    sha256: string
    mimeType: string
    url: string
}

/**
 * Downloads, verifies, and stores call recordings/transcripts Meta makes
 * available via webhook. Meta deletes the media 7 days after the
 * *_available webhook fires — this exists to win that race before it's gone.
 */
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

    async transcriptAvailable(payload: RecordingAvailablePayload): Promise<void> {
        const row = await this.repository.findOrCreate(payload.callId, payload.wacid)
        if (row.transcriptStatus !== RecordingArtifactStatus.PENDING || row.transcriptMediaId) {
            logger.info("Duplicate call_transcription_available ignored", { wacid: payload.wacid })
            return
        }
        const availableAt = new Date()
        await this.repository.updateTranscript(row.id, {
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
        const s3Key = this.readyS3Key(row, "recording", row?.recordingStatus, row?.recordingS3Key)
        return this.storage.getPresignedUrl(s3Key)
    }

    /**
     * Returns parsed JSON, not a URL: MinIO presigned URLs may not have CORS
     * enabled for direct browser fetch, so this goes through an authenticated endpoint instead.
     */
    async getTranscriptContent(callId: number): Promise<unknown> {
        const row = await this.repository.findByCallId(callId)
        const s3Key = this.readyS3Key(row, "transcript", row?.transcriptStatus, row?.transcriptS3Key)
        const bytes = await this.storage.download(s3Key)
        try {
            return JSON.parse(bytes.toString("utf-8"))
        } catch (err) {
            logger.error("Stored transcript is not valid JSON", { callId, s3Key, err })
            throw new NotFoundException("Transcript is corrupted")
        }
    }

    private readyS3Key(
        row: CallRecording | null, kind: "recording" | "transcript",
        status: RecordingArtifactStatus | undefined, s3Key: string | null | undefined,
    ): string {
        if (!row || !status) throw new NotFoundException(`No ${kind} for this call`)
        if (status === RecordingArtifactStatus.EXPIRED) throw new GoneException(`This ${kind} expired before it could be downloaded`)
        if (status !== RecordingArtifactStatus.STORED || !s3Key) throw new NotFoundException(`${kind} is not ready yet (status: ${status})`)
        return s3Key
    }

    /** Fetches whatever's PENDING, soonest-expiring first; a failure here just waits for the next tick, since Meta gives 7 days, not one shot. */
    async processDueDownloads(limit = 20): Promise<void> {
        const rows = await this.repository.findDuePendingDownloads(limit)
        for (const row of rows) {
            if (row.recordingStatus === RecordingArtifactStatus.PENDING && row.recordingMediaId) {
                await this.downloadOne(row, "recording")
            }
            if (row.transcriptStatus === RecordingArtifactStatus.PENDING && row.transcriptMediaId) {
                await this.downloadOne(row, "transcript")
            }
        }
    }

    /** Safety net: processDueDownloads should always win this race, so a row landing here means something got stuck (Meta down, MinIO down, a bug). */
    async markExpired(): Promise<void> {
        const rows = await this.repository.findExpiredPending(new Date())
        for (const row of rows) {
            if (row.recordingStatus === RecordingArtifactStatus.PENDING && row.recordingExpiresAt && row.recordingExpiresAt < new Date()) {
                logger.error("Call recording expired before download — permanently lost", { wacid: row.wacid, callId: row.callId })
                await this.repository.updateRecording(row.id, { status: RecordingArtifactStatus.EXPIRED })
            }
            if (row.transcriptStatus === RecordingArtifactStatus.PENDING && row.transcriptExpiresAt && row.transcriptExpiresAt < new Date()) {
                logger.error("Call transcript expired before download — permanently lost", { wacid: row.wacid, callId: row.callId })
                await this.repository.updateTranscript(row.id, { status: RecordingArtifactStatus.EXPIRED })
            }
        }
    }

    private async downloadOne(row: CallRecording, kind: "recording" | "transcript"): Promise<void> {
        const mediaId = kind === "recording" ? row.recordingMediaId! : row.transcriptMediaId!
        const expectedSha256 = kind === "recording" ? row.recordingSha256 : row.transcriptSha256
        const mimeType = kind === "recording" ? row.recordingMimeType : row.transcriptMimeType

        try {
            // The webhook's own `url` has a ~5-minute validity, which the job interval plus queueing can outlast — always refetch fresh from the Media API.
            const media = await this.metaClient.getMediaUrl(mediaId)
            const bytes = await this.metaClient.downloadMedia(media.url)

            // Meta sends this as lowercase hex, not base64, despite what the docs say.
            const actualSha256 = createHash("sha256").update(bytes).digest("hex")
            if (expectedSha256 && actualSha256 !== expectedSha256) {
                throw new Error(`SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`)
            }

            const key = this.objectKey(row, kind, mimeType ?? media.mime_type)
            await this.storage.upload(key, bytes, mimeType ?? media.mime_type)

            const update = { status: RecordingArtifactStatus.STORED, s3Key: key, error: null }
            if (kind === "recording") await this.repository.updateRecording(row.id, update)
            else await this.repository.updateTranscript(row.id, update)

            logger.info(`Call ${kind} downloaded and stored`, { wacid: row.wacid, key })
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error(`Failed downloading call ${kind}`, { wacid: row.wacid, err })
            const update = { status: RecordingArtifactStatus.PENDING, error: message }
            if (kind === "recording") await this.repository.updateRecording(row.id, update)
            else await this.repository.updateTranscript(row.id, update)
        }
    }

    /** `recordings/{y}/{m}/{d}/{wacid}-{kind}.{ext}` */
    private objectKey(row: CallRecording, kind: "recording" | "transcript", mimeType: string): string {
        const date = row.createdAt ?? new Date()
        const y = date.getUTCFullYear()
        const m = String(date.getUTCMonth() + 1).padStart(2, "0")
        const d = String(date.getUTCDate()).padStart(2, "0")
        const ext = kind === "transcript" ? "json" : mimeType.includes("opus") ? "ogg" : "audio"
        return `recordings/${y}/${m}/${d}/${row.wacid}-${kind}.${ext}`
    }

    private addRetentionDays(from: Date): Date {
        return new Date(from.getTime() + config.recording.metaRetentionDays * 24 * 60 * 60 * 1000)
    }
}
