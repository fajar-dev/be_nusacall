import { ICallRecordingRepository } from "./interfaces/call-recording.repository.interface"
import { CallRecording } from "./entities/call-recording.entity"
import { logger } from "../../core/helpers/logger"
import { NotFoundException } from "../../core/exceptions/base"
import type { RecordedTrack } from "../../infrastructure/media/call-recorder"

export interface IObjectStorage {
    upload(objectName: string, buffer: Buffer, contentType: string): Promise<string>
    getPresignedUrl(objectName: string, expirySeconds?: number): Promise<string>
}

export interface RecordingUrls {
    customer: string | null
    agent: string | null
    durationSeconds: number
}

const OPUS_MIME_TYPE = "audio/ogg"

/**
 * Persists the Ogg Opus files captured by the media bridge. Nothing is fetched
 * from Meta — the audio is produced locally while the call is in progress.
 */
export class CallRecordingService {
    constructor(
        private readonly repository: ICallRecordingRepository,
        private readonly storage: IObjectStorage,
    ) {}

    async storeRecordings(callId: number, wacid: string, tracks: RecordedTrack[], readFile: (path: string) => Promise<Buffer>): Promise<void> {
        const keys: { customerS3Key: string | null; agentS3Key: string | null } = { customerS3Key: null, agentS3Key: null }
        let durationSeconds = 0

        for (const track of tracks) {
            durationSeconds = Math.max(durationSeconds, Math.round(track.durationSeconds))
            try {
                const bytes = await readFile(track.path)
                const key = this.objectKey(wacid, track.track)
                await this.storage.upload(key, bytes, OPUS_MIME_TYPE)
                if (track.track === "customer") keys.customerS3Key = key
                else keys.agentS3Key = key
            } catch (err) {
                logger.error("Failed uploading call recording track", { wacid, track: track.track, err })
            }
        }

        if (!keys.customerS3Key && !keys.agentS3Key) {
            logger.error("No recording track could be stored", { wacid })
            return
        }

        await this.repository.store({ callId, wacid, ...keys, durationSeconds })
        logger.info("Call recording stored", { wacid, durationSeconds, ...keys })
    }

    async getRecordingUrls(callId: number): Promise<RecordingUrls> {
        const row = await this.repository.findByCallId(callId)
        if (!row || (!row.customerS3Key && !row.agentS3Key)) {
            throw new NotFoundException("No recording for this call")
        }
        return {
            customer: row.customerS3Key ? await this.storage.getPresignedUrl(row.customerS3Key) : null,
            agent: row.agentS3Key ? await this.storage.getPresignedUrl(row.agentS3Key) : null,
            durationSeconds: row.durationSeconds,
        }
    }

    async findByCallId(callId: number): Promise<CallRecording | null> {
        return await this.repository.findByCallId(callId)
    }

    private objectKey(wacid: string, track: string): string {
        const now = new Date()
        const y = now.getUTCFullYear()
        const m = String(now.getUTCMonth() + 1).padStart(2, "0")
        const d = String(now.getUTCDate()).padStart(2, "0")
        const safeWacid = wacid.replace(/[^A-Za-z0-9._-]/g, "_")
        return `recordings/${y}/${m}/${d}/${safeWacid}-${track}.opus`
    }
}
