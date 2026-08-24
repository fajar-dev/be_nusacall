import { callService, nusawaLogService, callRecordingService } from "../modules/call/call.module"
import { config } from "../config/config"
import { logger } from "../core/helpers/logger"

/** Retries queued nusawa call-log messages (docs/INTEGRATION-NUSAWA.md §3.5). Every 30s. */
export async function flushNusawaLogJob(): Promise<void> {
    const { sent, failed } = await nusawaLogService.flushDue()
    if (sent || failed) logger.info("nusawa log queue flushed", { sent, failed })
}

/** Closes calls stuck ACTIVE with no matching media session — a webhook we never got. Every 2 min. */
export async function reconcileCallsJob(): Promise<void> {
    const closed = await callService.reconcileStale(config.call.reconcileAfterMinutes)
    if (closed) logger.warn("reconciled stale calls", { count: closed })
}

/**
 * Downloads recordings/transcripts Meta has made available, soonest-
 * expiring first (docs/ROADMAP.md Fase 2). Every
 * config.recording.downloadJobIntervalMinutes (default 5 min) — Meta only
 * gives us 7 days total, so this can't lag far behind.
 */
export async function downloadRecordingsJob(): Promise<void> {
    await callRecordingService.processDueDownloads()
}

/** Safety-net alarm for anything downloadRecordingsJob never got to in time. Every 30 min. */
export async function expireRecordingsJob(): Promise<void> {
    await callRecordingService.markExpired()
}

/** Registers all jobs as intervals on the running process. Called once from src/index.ts. */
export function startJobs(): void {
    setInterval(() => void flushNusawaLogJob(), 30_000)
    setInterval(() => void reconcileCallsJob(), 2 * 60_000)
    setInterval(() => void downloadRecordingsJob(), config.recording.downloadJobIntervalMinutes * 60_000)
    setInterval(() => void expireRecordingsJob(), 30 * 60_000)
}
