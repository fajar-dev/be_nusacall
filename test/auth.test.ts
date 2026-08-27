import { describe, test, expect, beforeAll, afterAll, beforeEach, spyOn } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"
import { nusaworkClient } from "../src/infrastructure/nusawork/nusawork.client"
import { AuthHelper } from "../src/core/helpers/auth"
import { Role } from "../src/modules/user/enums/role.enum"

// Lazy require(), not a top-level import: Bun evaluates static imports before any
// beforeAll runs, which would construct UserRepository's singleton before
// initTestDatabase() swaps in the test database.
function getUserService(): { save: (data: unknown) => Promise<any> } {
    return require("../src/modules/user/user.module").userService
}

// Exercises the real login flow end-to-end except the network hop to Nusawork/Google,
// both stubbed via spyOn since neither is reachable in this test environment.

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

async function seedUser(overrides: Partial<{ email: string; isActive: boolean; name: string }> = {}) {
    return await getUserService().save({
        email: overrides.email ?? "user@nusa.id",
        name: overrides.name ?? "Budi Santoso",
        employeeId: Math.floor(Math.random() * 1_000_000),
        role: Role.AGENT,
        isActive: overrides.isActive ?? true,
    })
}

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
        await seedUser({ email: "agent@nusa.id" })
        spyOn(nusaworkClient, "authLogin").mockResolvedValue(true)

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "agent@nusa.id", password: "secret" },
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.data.accessToken).toBeTruthy()
        expect(body.data.user.email).toBe("agent@nusa.id")
        expect(body.data.user.name).toBe("Budi Santoso")
    })

    test("rejects a user not registered locally (401)", async () => {
        spyOn(nusaworkClient, "authLogin").mockResolvedValue(true)

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "unknown@nusa.id", password: "secret" },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("rejects an inactive user (401)", async () => {
        await seedUser({ email: "inactive@nusa.id", isActive: false })
        spyOn(nusaworkClient, "authLogin").mockResolvedValue(true)

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "inactive@nusa.id", password: "secret" },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("rejects an invalid password (401)", async () => {
        await seedUser({ email: "agent@nusa.id" })
        spyOn(nusaworkClient, "authLogin").mockResolvedValue(false)

        const { status, body } = await request(app, "/api/auth/login", {
            method: "POST",
            body: { email: "agent@nusa.id", password: "wrong" },
        })

        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })
})

describe("POST /api/auth/google", () => {
    test("rejects a request without code (422)", async () => {
        const { status, body } = await request(app, "/api/auth/google", {
            method: "POST",
            body: {},
        })
        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })

    test("issues a NusaCall JWT for a valid Google ID token (200)", async () => {
        await seedUser({ email: "agent@nusa.id" })
        spyOn(AuthHelper, "verifyGoogleCode").mockResolvedValue({ email: "agent@nusa.id" } as never)

        const { status, body } = await request(app, "/api/auth/google", {
            method: "POST",
            body: { code: "fake-google-auth-code" },
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.data.accessToken).toBeTruthy()
        expect(body.data.user.email).toBe("agent@nusa.id")
    })

    test("rejects a user not registered locally (400)", async () => {
        spyOn(AuthHelper, "verifyGoogleCode").mockResolvedValue({ email: "unknown@nusa.id" } as never)

        const { status, body } = await request(app, "/api/auth/google", {
            method: "POST",
            body: { code: "fake-google-auth-code" },
        })

        expect(status).toBe(400)
        expect(body.success).toBe(false)
    })

    test("rejects an inactive user (400)", async () => {
        await seedUser({ email: "inactive@nusa.id", isActive: false })
        spyOn(AuthHelper, "verifyGoogleCode").mockResolvedValue({ email: "inactive@nusa.id" } as never)

        const { status, body } = await request(app, "/api/auth/google", {
            method: "POST",
            body: { code: "fake-google-auth-code" },
        })

        expect(status).toBe(400)
        expect(body.success).toBe(false)
    })
})

describe("POST /api/auth/refresh", () => {
    test("rejects a request without refreshToken (422)", async () => {
        const { status } = await request(app, "/api/auth/refresh", { method: "POST", body: {} })
        expect(status).toBe(422)
    })

    test("issues a new access token for a valid refresh token (200)", async () => {
        const user = await seedUser({ email: "refresh@nusa.id" })
        const { refreshToken } = await AuthHelper.generateTokens(user)

        const { status, body } = await request(app, "/api/auth/refresh", {
            method: "POST",
            body: { refreshToken },
        })

        expect(status).toBe(200)
        expect(body.data.accessToken).toBeTruthy()
        expect(body.data.user.email).toBe("refresh@nusa.id")
    })

    test("rejects an invalid refresh token (401)", async () => {
        const { status } = await request(app, "/api/auth/refresh", {
            method: "POST",
            body: { refreshToken: "not-a-real-token" },
        })
        expect(status).toBe(401)
    })
})

describe("GET /api/auth/me", () => {
    test("requires authentication (401 without token)", async () => {
        const { status } = await request(app, "/api/auth/me")
        expect(status).toBe(401)
    })

    test("returns the authenticated user's profile", async () => {
        const { headers } = await createUserAndToken({ email: "me@nusa.id" })

        const { status, body } = await request(app, "/api/auth/me", { headers })

        expect(status).toBe(200)
        expect(body.data.email).toBe("me@nusa.id")
    })

    test("rejects a token for a user who has since been deactivated (401)", async () => {
        // Guards against trusting a still-valid JWT after the account is deactivated —
        // authMiddleware must re-check isActive on every request.
        const { user, headers } = await createUserAndToken({ email: "deactivated@nusa.id" })
        await getUserService().save({ id: user.id, isActive: false })

        const { status } = await request(app, "/api/auth/me", { headers })

        expect(status).toBe(401)
    })
})

describe("POST /api/auth/logout", () => {
    test("requires authentication (401 without token)", async () => {
        const { status } = await request(app, "/api/auth/logout", { method: "POST" })
        expect(status).toBe(401)
    })

    test("succeeds for an authenticated user", async () => {
        const { headers } = await createUserAndToken()

        const { status, body } = await request(app, "/api/auth/logout", {
            method: "POST",
            headers,
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
    })
})
