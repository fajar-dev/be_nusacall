import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createAgentAndToken } from "./setup"
import { config } from "../src/config/config"

/**
 * Exercises the real login flow end-to-end EXCEPT the network hops to
 * nusawa, which are stubbed via a global fetch mock — nusawa itself isn't
 * running in this test environment. The frontend never calls nusawa
 * directly; only NusaCall's backend does (POST /api/login then GET
 * /api/me). Everything downstream of that (Agent upsert, JWT signing,
 * response shape) is real.
 * See: docs/INTEGRATION-NUSAWA.md §2.2, docs/API-SPEC.md §2
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

function mockNusawa(opts: {
    login?: { status: number; body: unknown }
    loginGoogle?: { status: number; body: unknown }
    me?: { status: number; body: unknown }
}) {
    globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = url.toString()
        if (urlStr === `${config.nusawa.baseUrl}/api/login`) {
            if (!opts.login) throw new Error("Unexpected nusawa login call in test")
            return new Response(JSON.stringify(opts.login.body), { status: opts.login.status })
        }
        if (urlStr === `${config.nusawa.baseUrl}/api/login/google`) {
            if (!opts.loginGoogle) throw new Error("Unexpected nusawa google login call in test")
            return new Response(JSON.stringify(opts.loginGoogle.body), { status: opts.loginGoogle.status })
        }
        if (urlStr === `${config.nusawa.baseUrl}/api/me`) {
            if (!opts.me) throw new Error("Unexpected nusawa me call in test")
            return new Response(JSON.stringify(opts.me.body), { status: opts.me.status })
        }
        throw new Error(`Unexpected fetch call in test: ${urlStr}`)
    }) as typeof fetch
}

const fakeLoginSession = { status: 200, body: { access_token: "fake-nusawa-jwt", expires_in: 3600, token_type: "Bearer" } }

describe("POST /api/auth/login", () => {
    test("rejects a request without email/password (422)", async () => {
        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: {},
        })
        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })

    test("issues a NusaCall JWT for valid credentials (200)", async () => {
        mockNusawa({
            login: fakeLoginSession,
            me: { status: 200, body: { username: "agent@nusa.id", name: "Budi Santoso", role: "agent", status: "active" } },
        })

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "agent@nusa.id", password: "secret" },
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.data.accessToken).toBeTruthy()
        expect(body.data.tokenType).toBe("Bearer")
        expect(body.data.user.username).toBe("agent@nusa.id")
        expect(body.data.user.displayName).toBe("Budi Santoso")
        expect(body.data.user.role).toBe("agent")
    })

    test("rejects an inactive nusawa user (401)", async () => {
        mockNusawa({
            login: fakeLoginSession,
            me: { status: 200, body: { username: "inactive@nusa.id", name: "X", role: "agent", status: "inactive" } },
        })

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "inactive@nusa.id", password: "secret" },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("rejects an invalid email or password (401)", async () => {
        mockNusawa({ login: { status: 401, body: { message: "unauthorized" } } })

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "agent@nusa.id", password: "wrong" },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("returns 503 when nusawa is unreachable", async () => {
        mockNusawa({ login: { status: 500, body: { message: "internal error" } } })

        const { status } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "agent@nusa.id", password: "secret" },
        })

        expect(status).toBe(503)
    })

    test("upserts the same Agent row on repeated logins (does not duplicate)", async () => {
        mockNusawa({
            login: fakeLoginSession,
            me: { status: 200, body: { username: "repeat@nusa.id", name: "Repeat User", role: "agent", status: "active" } },
        })

        const first = await request(app, "/api/auth/login", { method: "POST", body: { email: "repeat@nusa.id", password: "secret" } })
        const second = await request(app, "/api/auth/login", { method: "POST", body: { email: "repeat@nusa.id", password: "secret" } })

        expect(first.status).toBe(200)
        expect(second.status).toBe(200)

        const { getDataSource } = await import("../src/config/database")
        const { Agent } = await import("../src/modules/agent/entities/agent.entity")
        const count = await getDataSource().getRepository(Agent).countBy({ username: "repeat@nusa.id" })
        expect(count).toBe(1)
    })
})

describe("POST /api/auth/login/google", () => {
    test("rejects a request without idToken (422)", async () => {
        const { status, body } = await request(app, "/api/auth/login/google", {
            method: "POST",
            body: {},
        })
        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })

    test("issues a NusaCall JWT for a valid Google ID token (200)", async () => {
        mockNusawa({
            loginGoogle: fakeLoginSession,
            me: { status: 200, body: { username: "agent@nusa.id", name: "Budi Santoso", role: "agent", status: "active" } },
        })

        const { status, body } = await request(app, "/api/auth/login/google", {
            method: "POST",
            body: { idToken: "fake-google-id-token" },
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.data.accessToken).toBeTruthy()
        expect(body.data.user.username).toBe("agent@nusa.id")
    })

    test("rejects an inactive nusawa user (401)", async () => {
        mockNusawa({
            loginGoogle: fakeLoginSession,
            me: { status: 200, body: { username: "inactive@nusa.id", name: "X", role: "agent", status: "inactive" } },
        })

        const { status, body } = await request(app, "/api/auth/login/google", {
            method: "POST",
            body: { idToken: "fake-google-id-token" },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("rejects an invalid Google ID token (401)", async () => {
        mockNusawa({ loginGoogle: { status: 401, body: { message: "unauthorized" } } })

        const { status, body } = await request(app, "/api/auth/login/google", {
            method: "POST",
            body: { idToken: "not-a-real-token" },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("returns 503 when nusawa is unreachable", async () => {
        mockNusawa({ loginGoogle: { status: 500, body: { message: "internal error" } } })

        const { status } = await request(app, "/api/auth/login/google", {
            method: "POST",
            body: { idToken: "fake-google-id-token" },
        })

        expect(status).toBe(503)
    })
})

describe("GET /api/auth/me", () => {
    test("requires authentication (401 without token)", async () => {
        const { status } = await request(app, "/api/auth/me")
        expect(status).toBe(401)
    })

    test("returns the authenticated agent's profile", async () => {
        mockNusawa({
            login: fakeLoginSession,
            me: { status: 200, body: { username: "me@nusa.id", name: "Me", role: "manager", status: "active" } },
        })
        const login = await request(app, "/api/auth/login", { method: "POST", body: { email: "me@nusa.id", password: "secret" } })

        const { status, body } = await request(app, "/api/auth/me", {
            headers: { Authorization: `Bearer ${login.body.data.accessToken}` },
        })

        expect(status).toBe(200)
        expect(body.data.username).toBe("me@nusa.id")
        expect(body.data.role).toBe("manager")
    })
})

describe("POST /api/auth/logout", () => {
    test("requires authentication (401 without token)", async () => {
        const { status } = await request(app, "/api/auth/logout", { method: "POST" })
        expect(status).toBe(401)
    })

    test("succeeds for an authenticated agent", async () => {
        mockNusawa({
            login: fakeLoginSession,
            me: { status: 200, body: { username: "logout@nusa.id", name: "X", role: "agent", status: "active" } },
        })
        const login = await request(app, "/api/auth/login", { method: "POST", body: { email: "logout@nusa.id", password: "secret" } })

        const { status, body } = await request(app, "/api/auth/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${login.body.data.accessToken}` },
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
    })
})

describe("authMiddleware — canReceiveCalls must not gate general API access", () => {
    test("an agent ineligible for calls can still use the app (regression)", async () => {
        // A real bug: authMiddleware used to reject `!agent.canReceiveCalls`,
        // which meant ANY agent not yet marked call-eligible (the default for
        // a brand-new manager/supervisor account, or one an admin turned off)
        // was locked out of the entire authenticated API immediately after
        // login — dashboard, agent list, everything. canReceiveCalls is a
        // routing/eligibility concern (see AgentService.getAvailableForCalls),
        // not an authentication gate.
        const { headers } = await createAgentAndToken({ canReceiveCalls: false })

        const { status } = await request(app, "/api/agent/me", { headers })

        expect(status).toBe(200)
    })
})
