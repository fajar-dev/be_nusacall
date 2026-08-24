import { callService, nusawaLogService } from "../modules/call/call.module"
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

/** Registers both jobs as intervals on the running process. Called once from src/index.ts. */
export function startJobs(): void {
    setInterval(() => void flushNusawaLogJob(), 30_000)
    setInterval(() => void reconcileCallsJob(), 2 * 60_000)
}
