import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { RecordedTrack, RecordingTrack } from "./call-recorder"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"

const run = promisify(execFile)

const CHANNEL_ORDER: RecordingTrack[] = ["customer", "agent"]

export interface MixedRecording {
    path: string
    durationSeconds: number
}

function delayMilliseconds(track: RecordedTrack, earliest: number): number {
    return Math.max(0, Math.round(track.startedAt.getTime() - earliest))
}

/**
 * Menyusun filter ffmpeg yang menyelaraskan tiap arah menurut waktu paket
 * pertamanya, lalu menempatkan pelanggan di kanal kiri dan agen di kanan.
 * Tiap arah diberi bantalan senyap karena amerge berhenti pada masukan
 * terpendek, sehingga arah yang berakhir belakangan akan terpotong.
 */
function buildFilter(ordered: RecordedTrack[], earliest: number): string {
    const labels = ordered.map((track, index) => {
        const delay = delayMilliseconds(track, earliest)
        return `[${index}:a]adelay=${delay}|${delay},aformat=channel_layouts=mono,apad[${track.track}]`
    })

    if (ordered.length === 2) {
        return `${labels.join(";")};[customer][agent]amerge=inputs=2[out]`
    }

    const only = ordered[0]!
    const pan = only.track === "customer" ? "c0=c0|c1=0*c0" : "c0=0*c0|c1=c0"
    return `${labels[0]};[${only.track}]pan=stereo|${pan}[out]`
}

/**
 * Menggabungkan rekaman tiap arah menjadi satu berkas stereo. Pemanggilan
 * dilakukan setelah panggilan berakhir sehingga jalur media yang sedang
 * berjalan tidak ikut menanggung biaya decode dan encode.
 */
export async function mixToStereo(tracks: RecordedTrack[], outputPath: string): Promise<MixedRecording | null> {
    if (!tracks.length) return null

    const ordered = CHANNEL_ORDER
        .map((name) => tracks.find((t) => t.track === name))
        .filter((t): t is RecordedTrack => t !== undefined)

    if (!ordered.length) return null

    const earliest = Math.min(...ordered.map((t) => t.startedAt.getTime()))
    const durationSeconds = Math.max(
        ...ordered.map((track) => delayMilliseconds(track, earliest) / 1000 + track.durationSeconds)
    )

    const args = [
        "-hide_banner", "-loglevel", "error", "-y",
        ...ordered.flatMap((track) => ["-i", track.path]),
        "-filter_complex", buildFilter(ordered, earliest),
        "-map", "[out]", "-ac", "2", "-t", durationSeconds.toFixed(3),
        "-c:a", "libopus",
        outputPath,
    ]

    try {
        await run(config.recording.ffmpegPath, args)
    } catch (err) {
        logger.error("Failed mixing call recording — is ffmpeg installed?", {
            ffmpegPath: config.recording.ffmpegPath, err,
        })
        return null
    }

    return { path: outputPath, durationSeconds }
}
