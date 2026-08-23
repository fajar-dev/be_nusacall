import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request } from "./setup"
import { createUserData, resetCounters } from "./helpers"
import en from "../src/core/i18n/en.json"
import id from "../src/core/i18n/id.json"

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono

beforeAll(async () => {
    await initTestDatabase()
    app = createTestApp()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
    resetCounters()
})

// ═══════════════════════════════════════════════════════════════════════════
// Language Detection (Accept-Language header)
// ═══════════════════════════════════════════════════════════════════════════

describe("Language detection", () => {
    test("defaults to English when Accept-Language header is not sent", async () => {
        const { headers } = await request(app, "/api/contact")

        expect(headers.get("Content-Language")).toBe("en")
    })

    test("uses Indonesian when Accept-Language: id is sent", async () => {
        const { headers } = await request(app, "/api/contact", {
            headers: { "Accept-Language": "id" },
        })

        expect(headers.get("Content-Language")).toBe("id")
    })

    test("uses English when Accept-Language: en is sent", async () => {
        const { headers } = await request(app, "/api/contact", {
            headers: { "Accept-Language": "en" },
        })

        expect(headers.get("Content-Language")).toBe("en")
    })

    test("resolves regional variants to the base language (id-ID -> id)", async () => {
        const { headers } = await request(app, "/api/contact", {
            headers: { "Accept-Language": "id-ID,id;q=0.9" },
        })

        expect(headers.get("Content-Language")).toBe("id")
    })

    test("falls back to English when the requested language is unsupported", async () => {
        const { headers } = await request(app, "/api/contact", {
            headers: { "Accept-Language": "fr-FR,fr;q=0.9" },
        })

        expect(headers.get("Content-Language")).toBe("en")
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// Localized Response Messages
// ═══════════════════════════════════════════════════════════════════════════

describe("Localized response messages", () => {
    test("success message is translated to Indonesian", async () => {
        const userData = createUserData()
        const { userService } = require("../src/modules/user/user.module")
        await userService.create({ ...userData })

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            headers: { "Accept-Language": "id" },
            body: { email: userData.email, password: userData.password },
        })

        expect(status).toBe(200)
        expect(body.message).toBe("Berhasil masuk")
    })

    test("success message stays in English by default", async () => {
        const userData = createUserData()
        const { userService } = require("../src/modules/user/user.module")
        await userService.create({ ...userData })

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: userData.email, password: userData.password },
        })

        expect(status).toBe(200)
        expect(body.message).toBe("Logged in successfully")
    })

    test("exception message is translated to Indonesian", async () => {
        const { status, body } = await request(app, "/api/contact", {
            headers: { "Accept-Language": "id" },
        })

        expect(status).toBe(401)
        expect(body.message).toBe("Header otorisasi tidak ada atau tidak valid")
    })

    test("validation field messages are translated to Indonesian", async () => {
        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            headers: { "Accept-Language": "id" },
            body: { email: "not-an-email" },
        })

        expect(status).toBe(422)
        expect(body.message).toBe("Validasi gagal")
        const emailError = body.errors.find((e: any) => e.field === "email")
        expect(emailError.message).toBe("Email wajib diisi")
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// Locale Files Consistency (en.json <-> id.json)
// ═══════════════════════════════════════════════════════════════════════════

describe("Locale files consistency", () => {
    test("en.json and id.json have the same groups", () => {
        expect(Object.keys(id).sort()).toEqual(Object.keys(en).sort())
    })

    test("every group has matching keys in both files", () => {
        for (const group of Object.keys(en) as (keyof typeof en)[]) {
            expect(Object.keys(id[group]).sort()).toEqual(Object.keys(en[group]).sort())
        }
    })

    test("no translation value is empty", () => {
        for (const group of Object.values(id)) {
            for (const [key, value] of Object.entries(group)) {
                expect((value as string).length, `id.json["${key}"] is empty`).toBeGreaterThan(0)
            }
        }
    })
})
