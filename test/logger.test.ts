import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { Hono } from "hono"
import { existsSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { initTestDatabase, destroyTestDatabase, createTestApp, request } from "./setup"
import { logger } from "../src/core/helpers/logger"

const LOG_FILE = join(process.cwd(), "logs", `app-${new Date().toISOString().slice(0, 10)}.log`)

// bun:test's spyOn doesn't reliably intercept console.log/error, so capture manually instead.
function captureConsole(method: "log" | "error") {
    const calls: string[] = []
    const original = console[method]
    console[method] = ((...args: unknown[]) => { calls.push(args[0] as string) }) as typeof console[typeof method]
    return {
        calls,
        restore: () => { console[method] = original },
    }
}

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono

beforeAll(async () => {
    await initTestDatabase()
    app = createTestApp()
})

afterAll(async () => {
    await destroyTestDatabase()
    rmSync(join(process.cwd(), "logs"), { recursive: true, force: true })
})

// ═══════════════════════════════════════════════════════════════════════════
// logger — structured JSON output
// ═══════════════════════════════════════════════════════════════════════════

describe("logger", () => {
    test("logger.info writes one JSON line to stdout with base fields", () => {
        const console_ = captureConsole("log")
        logger.info("Something happened", { foo: "bar" })
        console_.restore()

        expect(console_.calls.length).toBe(1)
        const entry = JSON.parse(console_.calls[0])

        expect(entry.level).toBe("info")
        expect(entry.message).toBe("Something happened")
        expect(entry.service).toBe("nusacall")
        expect(typeof entry.environment).toBe("string")
        expect(typeof entry.timestamp).toBe("string")
        expect(new Date(entry.timestamp).toString()).not.toBe("Invalid Date")
        expect(entry.foo).toBe("bar")
    })

    test("logger.warn writes level=warn to stdout", () => {
        const console_ = captureConsole("log")
        logger.warn("Careful now")
        console_.restore()

        const entry = JSON.parse(console_.calls[0])
        expect(entry.level).toBe("warn")
    })

    test("logger.error serializes the err field and writes to stderr", () => {
        const console_ = captureConsole("error")
        logger.error("Boom", { err: new Error("kaboom") })
        console_.restore()

        const entry = JSON.parse(console_.calls[0])
        expect(entry.level).toBe("error")
        expect(entry.error.name).toBe("Error")
        expect(entry.error.message).toBe("kaboom")
        expect(typeof entry.error.stack).toBe("string")
    })

    test("logger.error appends a valid JSON line to logs/app-YYYY-MM-DD.log", () => {
        rmSync(join(process.cwd(), "logs"), { recursive: true, force: true })
        const console_ = captureConsole("error")
        logger.error("Persisted error", { err: new Error("disk write test") })
        console_.restore()

        expect(existsSync(LOG_FILE)).toBe(true)
        const lines = readFileSync(LOG_FILE, "utf-8").trim().split("\n")
        const entry = JSON.parse(lines[lines.length - 1])
        expect(entry.message).toBe("Persisted error")
        expect(entry.error.message).toBe("disk write test")
    })

    test("logger.info also persists to the same daily file, not just errors", () => {
        rmSync(join(process.cwd(), "logs"), { recursive: true, force: true })
        const console_ = captureConsole("log")
        logger.info("Persisted info")
        console_.restore()

        expect(existsSync(LOG_FILE)).toBe(true)
        const lines = readFileSync(LOG_FILE, "utf-8").trim().split("\n")
        const entry = JSON.parse(lines[lines.length - 1])
        expect(entry.level).toBe("info")
        expect(entry.message).toBe("Persisted info")
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// requestLogger middleware — X-Request-Id + access log
// ═══════════════════════════════════════════════════════════════════════════

describe("requestLogger middleware", () => {
    let console_: ReturnType<typeof captureConsole>

    beforeEach(() => {
        console_ = captureConsole("log")
    })

    afterEach(() => {
        console_.restore()
    })

    test("generates and returns an X-Request-Id header when none is sent", async () => {
        const { headers } = await request(app, "/api/user")

        expect(headers.get("X-Request-Id")).toBeTruthy()
    })

    test("echoes back a client-supplied X-Request-Id", async () => {
        const { headers } = await request(app, "/api/user", {
            headers: { "X-Request-Id": "custom-trace-id" },
        })

        expect(headers.get("X-Request-Id")).toBe("custom-trace-id")
    })

    test("logs an HTTP request entry with method, path, statusCode, durationMs", async () => {
        await request(app, "/api/user")

        const entries = console_.calls
            .map((line) => JSON.parse(line))
            .filter((entry) => entry.message === "HTTP request")
        const entry = entries[entries.length - 1]

        expect(entry.method).toBe("GET")
        expect(entry.path).toBe("/api/user")
        expect(entry.statusCode).toBe(401)
        expect(typeof entry.durationMs).toBe("number")
        expect(entry.requestId).toBeTruthy()
        expect(entry.level).toBe("warn")
    })
})
