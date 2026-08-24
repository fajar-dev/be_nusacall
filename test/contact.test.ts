import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createAgentAndToken } from "./setup"
import { config } from "../src/config/config"

/**
 * GET /api/contact is a read-only proxy over nusawa's GET /api/contacts.
 * The frontend never calls nusawa directly — only this backend does, using
 * the agent's own nusawa token captured at login (NusawaSessionRegistry).
 * See: docs/INTEGRATION-NUSAWA.md §3.6, docs/API-SPEC.md
 */

let app: Hono
let originalFetch: typeof fetch

beforeAll(async () => {
    await initTestDatabase()
    app = createTestApp()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
    originalFetch = globalThis.fetch
})

afterEach(() => {
    globalThis.fetch = originalFetch
})

const fakeLoginSession = { status: 200, body: { access_token: "fake-nusawa-jwt", expires_in: 3600, token_type: "Bearer" } }

function nusawaContact(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        phone_number: "628123456789",
        name: { String: "Budi Santoso", Valid: true },
        groups: null,
        timezone: null,
        branch_code: null,
        attributes: null,
        owned_by_phone_number_id: "202063559668129",
        owned_by_phone_number: "628990000000",
        is_group: 0,
        created_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-20T00:00:00Z",
        ...overrides,
    }
}

let contactsCallCount = 0

function mockNusawa(opts: {
    login?: { status: number; body: unknown }
    me?: { status: number; body: unknown }
    contacts?: { status: number; body: unknown }
}) {
    contactsCallCount = 0
    globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = url.toString()
        if (urlStr === `${config.nusawa.baseUrl}/api/login`) {
            if (!opts.login) throw new Error("Unexpected nusawa login call in test")
            return new Response(JSON.stringify(opts.login.body), { status: opts.login.status })
        }
        if (urlStr === `${config.nusawa.baseUrl}/api/me`) {
            if (!opts.me) throw new Error("Unexpected nusawa me call in test")
            return new Response(JSON.stringify(opts.me.body), { status: opts.me.status })
        }
        if (urlStr.startsWith(`${config.nusawa.baseUrl}/api/contacts`)) {
            if (!opts.contacts) throw new Error("Unexpected nusawa contacts call in test")
            contactsCallCount++
            return new Response(JSON.stringify(opts.contacts.body), { status: opts.contacts.status })
        }
        throw new Error(`Unexpected fetch call in test: ${urlStr}`)
    }) as typeof fetch
}

async function loginAndGetToken(username = "agent@nusa.id") {
    mockNusawa({
        login: fakeLoginSession,
        me: { status: 200, body: { username, name: "Budi Santoso", role: "agent", status: "active" } },
    })
    const login = await request(app, "/api/auth/login", { method: "POST", body: { email: username, password: "secret" } })
    expect(login.status).toBe(200)
    return login.body.data.accessToken as string
}

describe("GET /api/contact", () => {
    test("requires authentication (401 without token)", async () => {
        const { status } = await request(app, "/api/contact")
        expect(status).toBe(401)
    })

    test("returns the nusawa contact list, mapped to camelCase", async () => {
        const accessToken = await loginAndGetToken()

        mockNusawa({
            contacts: {
                status: 200,
                body: { data: [nusawaContact()], meta: { total: 1, per_page: 10, current_page: 1, total_page: 1 } },
            },
        })

        const { status, body } = await request(app, "/api/contact", {
            headers: { Authorization: `Bearer ${accessToken}` },
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].phoneNumber).toBe("628123456789")
        expect(body.data[0].name).toBe("Budi Santoso")
        expect(body.data[0].isGroup).toBe(false)
        expect(body.meta.total).toBe(1)
    })

    test("unwraps a null SqlNullString name to null", async () => {
        const accessToken = await loginAndGetToken("noname@nusa.id")

        mockNusawa({
            contacts: {
                status: 200,
                body: {
                    data: [nusawaContact({ name: { String: "", Valid: false } })],
                    meta: { total: 1, per_page: 10, current_page: 1, total_page: 1 },
                },
            },
        })

        const { body } = await request(app, "/api/contact", {
            headers: { Authorization: `Bearer ${accessToken}` },
        })

        expect(body.data[0].name).toBeNull()
    })

    test("caches results within the TTL — nusawa is called once for repeated requests", async () => {
        const accessToken = await loginAndGetToken("cached@nusa.id")

        mockNusawa({
            contacts: {
                status: 200,
                body: { data: [nusawaContact()], meta: { total: 1, per_page: 10, current_page: 1, total_page: 1 } },
            },
        })

        await request(app, "/api/contact", { headers: { Authorization: `Bearer ${accessToken}` } })
        await request(app, "/api/contact", { headers: { Authorization: `Bearer ${accessToken}` } })

        expect(contactsCallCount).toBe(1)
    })

    test("returns 401 asking to re-login when no nusawa session is cached", async () => {
        // Bypasses the nusawa login flow entirely — NusawaSessionRegistry
        // never got populated for this agent.
        const { accessToken } = await createAgentAndToken({ username: "no-session@nusa.id" })

        const { status, body } = await request(app, "/api/contact", {
            headers: { Authorization: `Bearer ${accessToken}` },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("returns 503 when nusawa is unreachable", async () => {
        const accessToken = await loginAndGetToken("unreachable@nusa.id")

        mockNusawa({ contacts: { status: 500, body: { message: "internal error" } } })

        const { status } = await request(app, "/api/contact", {
            headers: { Authorization: `Bearer ${accessToken}` },
        })

        expect(status).toBe(503)
    })

    test("supports search and pagination query params", async () => {
        const accessToken = await loginAndGetToken("search@nusa.id")

        mockNusawa({
            contacts: {
                status: 200,
                body: { data: [nusawaContact()], meta: { total: 1, per_page: 5, current_page: 2, total_page: 1 } },
            },
        })

        const { status, body } = await request(app, "/api/contact?page=2&limit=5&search=budi", {
            headers: { Authorization: `Bearer ${accessToken}` },
        })

        expect(status).toBe(200)
        expect(body.meta.currentPage).toBe(2)
        expect(body.meta.perPage).toBe(5)
    })
})
