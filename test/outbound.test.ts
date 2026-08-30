import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"

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
