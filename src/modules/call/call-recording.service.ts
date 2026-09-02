import { ICallRecordingRepository } from "./interfaces/call-recording.repository.interface"
import { CallRecording } from "./entities/call-recording.entity"
import { logger } from "../../core/helpers/logger"
import { NotFoundException } from "../../core/exceptions/base"

export interface IObjectStorage {
    upload(objectName: string, buffer: Buffer, contentType: string): Promise<string>
    getPresignedUrl(objectName: string, expirySeconds?: number): Promise<string>
}

export interface RecordingUrls {
    url: string
    durationSeconds: number
}

const WAV_MIME_TYPE = "audio/wav"

/**
 * Menyimpan rekaman yang dihasilkan Asterisk. Asterisk merekam di level bridge,
 * jadi kedua arah sudah tercampur jadi satu berkas — tidak ada lagi langkah
 * penggabungan di sisi backend.
 */
export class CallRecordingService {
    constructor(
        private readonly repository: ICallRecordingRepository,
        private readonly storage: IObjectStorage,
    ) {}

    async storeRecording(
        callId: number,
        wacid: string,
        filePath: string,
        durationSeconds: number,
        readFile: (path: string) => Promise<Buffer>,
    ): Promise<void> {
        const key = this.objectKey(wacid)

        try {
            const bytes = await readFile(filePath)
            await this.storage.upload(key, bytes, WAV_MIME_TYPE)
        } catch (err) {
            logger.error("Failed uploading call recording", { wacid, filePath, err })
            return
        }

        await this.repository.store({ callId, s3Key: key, durationSeconds: Math.round(durationSeconds) })
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
        return `recordings/${y}/${m}/${d}/${safeWacid}.wav`
    }
}
