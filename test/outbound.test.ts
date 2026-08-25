import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"

/**
 * HTTP-layer wiring only (auth, validation) for the Fase 3 outbound
 * endpoints — createTestApp() mounts the REAL routes/api.ts, which means a
 * real MetaClient hitting the live Graph API. That's untestable safely here
 * (dev credentials, no network in CI), so the actual permission-gating and
 * Meta-error-mapping logic is covered at the service level instead: see
 * test/permission.service.test.ts and the "initiateOutbound" describe block
 * in test/call-signaling.test.ts (which negotiates a real werift answer end
 * to end through WebhookService, no live Meta involved).
 */

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

describe("GET /api/permission", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/permission?phoneNumberId=202063559668129&waId=628123456789")
        expect(status).toBe(401)
    })
})

describe("POST /api/permission/request", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/permission/request", { method: "POST", body: {} })
        expect(status).toBe(401)
    })

    test("422s when phoneNumberId/waId are missing", async () => {
        const { headers } = await createUserAndToken()
        const { status, body } = await request(app, "/api/permission/request", { method: "POST", body: {}, headers })
        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })
})

describe("POST /api/call/outbound", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/call/outbound", { method: "POST", body: {} })
        expect(status).toBe(401)
    })

    test("422s when phoneNumberId/waId/offerSdp are missing", async () => {
        const { headers } = await createUserAndToken()
        const { status, body } = await request(app, "/api/call/outbound", { method: "POST", body: {}, headers })
        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })
})
