import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mixToStereo } from "../src/infrastructure/media/recording-mixer"
import type { RecordedTrack } from "../src/infrastructure/media/call-recorder"

const run = promisify(execFile)

const ffmpegAvailable = await run("ffmpeg", ["-hide_banner", "-version"]).then(() => true).catch(() => false)

let directory: string

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "nusacall-mixer-"))
})

afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
})

async function tone(name: string, frequency: number, seconds: number): Promise<string> {
    const path = join(directory, name)
    await run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=${seconds}:sample_rate=48000`,
        "-c:a", "libopus", path,
    ])
    return path
}

async function meanVolume(path: string, channel: 0 | 1, from: number, to: number): Promise<number> {
    const { stderr } = await run("ffmpeg", [
        "-hide_banner", "-i", path,
        "-af", `atrim=${from}:${to},pan=mono|c0=c${channel},volumedetect`,
        "-f", "null", "-",
    ]).catch((err: { stderr: string }) => ({ stderr: err.stderr }))
    const match = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)
    return match ? Number(match[1]) : 0
}

async function channels(path: string): Promise<number> {
    const { stdout } = await run("ffprobe", [
        "-v", "error", "-show_entries", "stream=channels", "-of", "csv=p=0", path,
    ])
    return Number(stdout.trim())
}

async function actualDuration(path: string): Promise<number> {
    const { stdout } = await run("ffprobe", [
        "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path,
    ])
    return Number(stdout.trim())
}

describe("mixToStereo", () => {
    test.skipIf(!ffmpegAvailable)("menaruh pelanggan di kiri dan agen di kanan pada satu berkas stereo", async () => {
        const tracks: RecordedTrack[] = [
            { track: "customer", path: await tone("c.opus", 440, 5), durationSeconds: 5, startedAt: new Date(10_000) },
            { track: "agent", path: await tone("a.opus", 880, 3), durationSeconds: 3, startedAt: new Date(10_000) },
        ]
        const output = join(directory, "mixed-aligned.opus")

        const mixed = await mixToStereo(tracks, output)

        expect(mixed).not.toBeNull()
        expect(await channels(output)).toBe(2)
        expect(await meanVolume(output, 0, 0, 2)).toBeGreaterThan(-60)
        expect(await meanVolume(output, 1, 0, 2)).toBeGreaterThan(-60)
    })

    test.skipIf(!ffmpegAvailable)("menunda arah yang mulai belakangan tanpa memotong ekornya", async () => {
        const tracks: RecordedTrack[] = [
            { track: "customer", path: await tone("c2.opus", 440, 3), durationSeconds: 3, startedAt: new Date(10_000) },
            { track: "agent", path: await tone("a2.opus", 880, 3), durationSeconds: 3, startedAt: new Date(12_000) },
        ]
        const output = join(directory, "mixed-delayed.opus")

        const mixed = await mixToStereo(tracks, output)

        expect(mixed!.durationSeconds).toBeCloseTo(5, 0)
        expect(await meanVolume(output, 0, 0, 1.5)).toBeGreaterThan(-60)
        expect(await meanVolume(output, 1, 0, 1.5)).toBeLessThan(-80)
        expect(await meanVolume(output, 1, 2.5, 3)).toBeGreaterThan(-60)

        expect(await actualDuration(output)).toBeCloseTo(mixed!.durationSeconds, 0)
        expect(await meanVolume(output, 1, 4.2, 4.9)).toBeGreaterThan(-60)
    })

    test.skipIf(!ffmpegAvailable)("tetap stereo ketika hanya satu arah yang terekam", async () => {
        const tracks: RecordedTrack[] = [
            { track: "agent", path: await tone("a3.opus", 880, 2), durationSeconds: 2, startedAt: new Date(10_000) },
        ]
        const output = join(directory, "mixed-single.opus")

        await mixToStereo(tracks, output)

        expect(await channels(output)).toBe(2)
        expect(await meanVolume(output, 0, 0, 1.5)).toBeLessThan(-80)
        expect(await meanVolume(output, 1, 0, 1.5)).toBeGreaterThan(-60)
    })

    test("mengembalikan null ketika tidak ada trek sama sekali", async () => {
        expect(await mixToStereo([], join(directory, "kosong.opus"))).toBeNull()
    })
})
