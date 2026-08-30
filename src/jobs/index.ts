import { callService, nusawaLogService, callRecordingService } from "../modules/call/call.module"
import { config } from "../config/config"
import { logger } from "../core/helpers/logger"

export async function flushNusawaLogJob(): Promise<void> {
    const { sent, failed } = await nusawaLogService.flushDue()
    if (sent || failed) logger.info("nusawa log queue flushed", { sent, failed })
}

export async function reconcileCallsJob(): Promise<void> {
    const closed = await callService.reconcileStale(config.call.reconcileAfterMinutes)
    if (closed) logger.warn("reconciled stale calls", { count: closed })
}

export async function downloadRecordingsJob(): Promise<void> {
    await callRecordingService.processDueDownloads()
}

export async function expireRecordingsJob(): Promise<void> {
    await callRecordingService.markExpired()
}

export function startJobs(): void {
    setInterval(() => void flushNusawaLogJob(), 30_000)
    setInterval(() => void reconcileCallsJob(), 2 * 60_000)
    setInterval(() => void downloadRecordingsJob(), config.recording.downloadJobIntervalMinutes * 60_000)
    setInterval(() => void expireRecordingsJob(), 30 * 60_000)
}
