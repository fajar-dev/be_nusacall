import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request } from "./setup"
import en from "../src/core/i18n/en.json"
import id from "../src/core/i18n/id.json"

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
})

// These tests hit /api/user because any authenticated route works — languageMiddleware
// and the global error handler run regardless of the route's own logic.

describe("Language detection", () => {
    test("defaults to English when Accept-Language header is not sent", async () => {
        const { headers } = await request(app, "/api/user")

        expect(headers.get("Content-Language")).toBe("en")
    })

    test("uses Indonesian when Accept-Language: id is sent", async () => {
        const { headers } = await request(app, "/api/user", {
            headers: { "Accept-Language": "id" },
        })

        expect(headers.get("Content-Language")).toBe("id")
    })

    test("uses English when Accept-Language: en is sent", async () => {
        const { headers } = await request(app, "/api/user", {
            headers: { "Accept-Language": "en" },
        })

        expect(headers.get("Content-Language")).toBe("en")
    })

    test("resolves regional variants to the base language (id-ID -> id)", async () => {
        const { headers } = await request(app, "/api/user", {
            headers: { "Accept-Language": "id-ID,id;q=0.9" },
        })

        expect(headers.get("Content-Language")).toBe("id")
    })

    test("falls back to English when the requested language is unsupported", async () => {
        const { headers } = await request(app, "/api/user", {
            headers: { "Accept-Language": "fr-FR,fr;q=0.9" },
        })

        expect(headers.get("Content-Language")).toBe("en")
    })
})

describe("Localized response messages", () => {
    test("exception message is translated to Indonesian", async () => {
        const { status, body } = await request(app, "/api/user", {
            headers: { "Accept-Language": "id" },
        })

        expect(status).toBe(401)
        expect(body.message).toBe("Header otorisasi tidak ada atau tidak valid")
    })

    test("exception message stays in English by default", async () => {
        const { status, body } = await request(app, "/api/user")

        expect(status).toBe(401)
        expect(body.message).toBe("Missing or invalid authorization header")
    })
})

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
