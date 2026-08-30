import { ICallRecordingRepository } from "./interfaces/call-recording.repository.interface"
import { CallRecording } from "./entities/call-recording.entity"
import { logger } from "../../core/helpers/logger"
import { NotFoundException } from "../../core/exceptions/base"
import type { RecordedTrack } from "../../infrastructure/media/call-recorder"
import { mixToStereo, type MixedRecording } from "../../infrastructure/media/recording-mixer"
import { dirname, join } from "node:path"

export type RecordingMixer = (tracks: RecordedTrack[], outputPath: string) => Promise<MixedRecording | null>

export interface IObjectStorage {
    upload(objectName: string, buffer: Buffer, contentType: string): Promise<string>
    getPresignedUrl(objectName: string, expirySeconds?: number): Promise<string>
}

export interface RecordingUrls {
    url: string
    durationSeconds: number
}

const OPUS_MIME_TYPE = "audio/ogg"

/**
 * Menyimpan rekaman yang dihasilkan jembatan media. Kedua arah digabung lebih
 * dulu menjadi satu berkas stereo, pelanggan di kiri dan agen di kanan.
 */
export class CallRecordingService {
    constructor(
        private readonly repository: ICallRecordingRepository,
        private readonly storage: IObjectStorage,
        private readonly mix: RecordingMixer = mixToStereo,
    ) {}

    async storeRecordings(
        callId: number,
        wacid: string,
        tracks: RecordedTrack[],
        readFile: (path: string) => Promise<Buffer>,
    ): Promise<void> {
        if (!tracks.length) return

        const mixedPath = join(dirname(tracks[0]!.path), "mixed.opus")
        const mixed = await this.mix(tracks, mixedPath)
        if (!mixed) {
            logger.error("Call recording could not be mixed — nothing stored", { wacid })
            return
        }

        const durationSeconds = Math.round(mixed.durationSeconds)
        const key = this.objectKey(wacid)

        try {
            const bytes = await readFile(mixed.path)
            await this.storage.upload(key, bytes, OPUS_MIME_TYPE)
        } catch (err) {
            logger.error("Failed uploading call recording", { wacid, err })
            return
        }

        await this.repository.store({ callId, wacid, s3Key: key, durationSeconds })
        logger.info("Call recording stored", { wacid, durationSeconds, key })
    }

    async getRecordingUrls(callId: number): Promise<RecordingUrls> {
        const row = await this.repository.findByCallId(callId)
        if (!row || !row.s3Key) {
            throw new NotFoundException("No recording for this call")
        }
        return {
            url: await this.storage.getPresignedUrl(row.s3Key),
            durationSeconds: row.durationSeconds,
        }
    }

    async findByCallId(callId: number): Promise<CallRecording | null> {
        return await this.repository.findByCallId(callId)
    }

    private objectKey(wacid: string): string {
        const now = new Date()
        const y = now.getUTCFullYear()
        const m = String(now.getUTCMonth() + 1).padStart(2, "0")
        const d = String(now.getUTCDate()).padStart(2, "0")
        const safeWacid = wacid.replace(/[^A-Za-z0-9._-]/g, "_")
        return `recordings/${y}/${m}/${d}/${safeWacid}.opus`
    }
}
