import { mkdir, rm, readFile } from "node:fs/promises"
import { createWriteStream, type WriteStream } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { RtpPacket } from "werift"
import { OggOpusWriter, OPUS_FRAME_SAMPLES_20MS } from "./ogg-opus-writer"
import { logger } from "../../core/helpers/logger"

export type RecordingTrack = "customer" | "agent"

export interface RecordedTrack {
    track: RecordingTrack
    path: string
    durationSeconds: number
    startedAt: Date
}

const REORDER_WINDOW = 16

/**
 * Writes one Ogg Opus file per direction straight from the bridged RTP.
 * Payloads are copied verbatim — nothing is decoded or re-encoded — and pages
 * are streamed to a temp file so a long call never accumulates in memory.
 */
class TrackRecorder {
    private readonly writer: OggOpusWriter
    private readonly stream: WriteStream
    private readonly buffered = new Map<number, Buffer>()
    private nextSequence: number | null = null
    private firstPacketAt: Date | null = null
    private closed = false

    constructor(readonly track: RecordingTrack, readonly path: string) {
        this.stream = createWriteStream(path)
        this.writer = new OggOpusWriter(2, (page) => {
            if (!this.closed) this.stream.write(page)
        })
    }

    push(rtp: RtpPacket): void {
        if (this.closed) return

        const sequence = rtp.header.sequenceNumber
        if (this.nextSequence === null) this.nextSequence = sequence
        if (this.firstPacketAt === null) this.firstPacketAt = new Date()

        this.buffered.set(sequence, Buffer.from(rtp.payload))
        this.drainInOrder()

        if (this.buffered.size > REORDER_WINDOW) this.skipToOldest()
    }

    private drainInOrder(): void {
        while (this.nextSequence !== null) {
            const packet = this.buffered.get(this.nextSequence)
            if (!packet) break
            this.buffered.delete(this.nextSequence)
            this.writer.write(packet, OPUS_FRAME_SAMPLES_20MS)
            this.nextSequence = (this.nextSequence + 1) & 0xffff
        }
    }

    /** A packet never arrived; jump past the gap so one loss cannot stall the file. */
    private skipToOldest(): void {
        const oldest = Math.min(...this.buffered.keys())
        this.nextSequence = oldest
        this.drainInOrder()
    }

    /** Anything still held by the reorder window is written in sequence order. */
    private drainRemaining(): void {
        for (const sequence of [...this.buffered.keys()].sort((a, b) => a - b)) {
            const packet = this.buffered.get(sequence)!
            this.writer.write(packet, OPUS_FRAME_SAMPLES_20MS)
        }
        this.buffered.clear()
    }

    async close(): Promise<RecordedTrack | null> {
        if (this.closed) return null
        this.drainRemaining()
        this.writer.finish()
        this.closed = true

        const duration = this.writer.durationSeconds
        await new Promise<void>((resolve) => this.stream.end(resolve))

        if (duration === 0) {
            await rm(this.path, { force: true })
            return null
        }
        return { track: this.track, path: this.path, durationSeconds: duration, startedAt: this.firstPacketAt ?? new Date() }
    }
}

export class CallRecorder {
    private readonly tracks = new Map<RecordingTrack, TrackRecorder>()
    private readonly directory: string
    private ready: Promise<void>
    private stopped = false

    constructor(private readonly wacid: string) {
        this.directory = join(tmpdir(), "nusacall-recordings", wacid.replace(/[^A-Za-z0-9._-]/g, "_"))
        this.ready = mkdir(this.directory, { recursive: true }).then(() => {
            if (this.stopped) return
            for (const track of ["customer", "agent"] as RecordingTrack[]) {
                this.tracks.set(track, new TrackRecorder(track, join(this.directory, `${track}.opus`)))
            }
        }).catch((err) => {
            logger.error("Failed preparing recording directory", { wacid, err })
        })
    }

    /** Must stay non-blocking: this runs inside the RTP forwarding path. */
    push(track: RecordingTrack, rtp: RtpPacket): void {
        if (this.stopped) return
        this.tracks.get(track)?.push(rtp)
    }

    async stop(): Promise<RecordedTrack[]> {
        if (this.stopped) return []
        await this.ready
        this.stopped = true

        const recorded: RecordedTrack[] = []
        for (const recorder of this.tracks.values()) {
            try {
                const result = await recorder.close()
                if (result) recorded.push(result)
            } catch (err) {
                logger.error("Failed closing recording track", { wacid: this.wacid, track: recorder.track, err })
            }
        }
        this.tracks.clear()
        return recorded
    }

    async read(path: string): Promise<Buffer> {
        return await readFile(path)
    }

    async cleanup(): Promise<void> {
        await rm(this.directory, { recursive: true, force: true })
    }
}
