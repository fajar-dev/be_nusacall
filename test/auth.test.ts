import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
    initTestDatabase,
    destroyTestDatabase,
    cleanTestDatabase,
    createTestApp,
    request,
    registerAndLogin,
} from "./setup"
import { createUserData, resetCounters } from "./helpers"

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
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/login", () => {
    test("should login successfully with valid credentials", async () => {
        const userData = createUserData()
        const { userService } = require("../src/modules/user/user.module")
        await userService.create({ ...userData })

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: userData.email, password: userData.password },
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("Logged in successfully")
        expect(body.data.user).toBeDefined()
        expect(body.data.user.email).toBe(userData.email)
        expect(body.data.user.hasPassword).toBe(true)
        expect(body.data.accessToken).toBeDefined()
        expect(body.data.refreshToken).toBeDefined()
        // Password should NOT be in response
        expect(body.data.user.password).toBeUndefined()
    })

    test("should fail with unregistered email", async () => {
        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "notexist@example.com", password: "password123" },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("should fail with wrong password", async () => {
        const userData = createUserData()
        const { userService } = require("../src/modules/user/user.module")
        await userService.create({ ...userData })

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: userData.email, password: "wrongpassword" },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("should fail validation without email", async () => {
        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { password: "password123" },
        })

        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })

    test("should fail validation without password", async () => {
        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "test@example.com" },
        })

        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })
})

describe("POST /api/auth/google", () => {
    test("should fail validation without code", async () => {
        const { status, body } = await request(app, "/api/auth/google", {
            method: "POST",
            body: {},
        })

        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/logout
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/logout", () => {
    test("should logout successfully", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/auth/logout", {
            method: "POST",
            headers,
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("Logged out successfully")
    })

    test("should fail without auth token", async () => {
        const { status, body } = await request(app, "/api/auth/logout", {
            method: "POST",
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })
})


