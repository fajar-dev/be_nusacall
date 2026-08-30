import { appendFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { config } from "../../config/config"

const LOG_DIR = join(process.cwd(), "logs")

function logFile(): string {
    const date = new Date().toISOString().slice(0, 10)
    return join(LOG_DIR, `app-${date}.log`)
}

import { LogLevel } from "../enums/log-level.enum"

interface LogFields {
    [key: string]: unknown
    err?: unknown
}

function ensureLogDir() {
    if (!existsSync(LOG_DIR)) {
        mkdirSync(LOG_DIR, { recursive: true })
    }
}

function serializeError(err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    return { name: error.name, message: error.message, stack: error.stack }
}

function write(level: LogLevel, message: string, fields: LogFields = {}) {
    const { err, ...rest } = fields

    const entry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level,
        service: config.app.name,
        environment: config.app.env,
        message,
        ...rest,
    }
    if (err !== undefined) {
        entry.error = serializeError(err)
    }

    const line = JSON.stringify(entry)

    if (level === LogLevel.ERROR) {
        console.error(line)
    } else {
        console.log(line)
    }

    ensureLogDir()
    appendFileSync(logFile(), line + "\n")
}

export const logger = {
    debug: (message: string, fields?: LogFields) => write(LogLevel.DEBUG, message, fields),
    info: (message: string, fields?: LogFields) => write(LogLevel.INFO, message, fields),
    warn: (message: string, fields?: LogFields) => write(LogLevel.WARN, message, fields),
    error: (message: string, fields?: LogFields) => write(LogLevel.ERROR, message, fields),
}
