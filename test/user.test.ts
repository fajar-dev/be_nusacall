import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"
import { presenceRegistry } from "../src/modules/user/presence.registry"

/** See test/auth.test.ts for why this is lazy-required rather than imported at the top. */
function getUserService(): { save: (data: unknown) => Promise<any> } {
    return require("../src/modules/user/user.module").userService
}

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
    // Drain any leftover presence from other test files sharing this singleton.
    for (const p of presenceRegistry.listAll()) {
        for (const connectionId of p.connectionIds) presenceRegistry.unregister(connectionId)
    }
})

async function seedUser(overrides: Partial<{ email: string; name: string; isActive: boolean; role: string }> = {}) {
    return await getUserService().save({
        email: overrides.email ?? `seed${Date.now()}${Math.floor(Math.random() * 1000)}@nusa.id`,
        name: overrides.name ?? "Seeded User",
        employeeId: Math.floor(Math.random() * 1_000_000),
        role: overrides.role ?? "agent",
        isActive: overrides.isActive ?? true,
    })
}

describe("GET /api/user", () => {
    test("requires authentication (401 without token)", async () => {
        const { status } = await request(app, "/api/user")
        expect(status).toBe(401)
    })

    test("lists users, paginated", async () => {
        const { headers } = await createUserAndToken()
        await seedUser({ name: "Budi Santoso", email: "budi@nusa.id" })
        await seedUser({ name: "Siti Aminah", email: "siti@nusa.id" })

        const { status, body } = await request(app, "/api/user?limit=10", { headers })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.meta.total).toBeGreaterThanOrEqual(3) // 2 seeded + the token's own user
    })

    test("searches by name or email", async () => {
        const { headers } = await createUserAndToken()
        await seedUser({ name: "Budi Santoso", email: "budi@nusa.id" })
        await seedUser({ name: "Siti Aminah", email: "siti@nusa.id" })

        const { status, body } = await request(app, "/api/user?q=budi", { headers })

        expect(status).toBe(200)
        expect(body.data.every((u: { name: string, email: string }) => `${u.name} ${u.email}`.toLowerCase().includes("budi"))).toBe(true)
    })

    test("filters by isActive", async () => {
        const { headers } = await createUserAndToken()
        await seedUser({ email: "active-user@nusa.id", isActive: true })
        await seedUser({ email: "inactive-user@nusa.id", isActive: false })

        const { body } = await request(app, "/api/user?isActive=false", { headers })

        expect(body.data.every((u: { isActive: boolean }) => u.isActive === false)).toBe(true)
        expect(body.data.some((u: { email: string }) => u.email === "inactive-user@nusa.id")).toBe(true)
    })
})

describe("GET /api/user/options", () => {
    test("returns a lightweight, active-only list", async () => {
        const { headers } = await createUserAndToken()
        await seedUser({ email: "opt-active@nusa.id", isActive: true })
        await seedUser({ email: "opt-inactive@nusa.id", isActive: false })

        const { status, body } = await request(app, "/api/user/options", { headers })

        expect(status).toBe(200)
        expect(body.data.some((u: { email: string }) => u.email === "opt-active@nusa.id")).toBe(true)
        expect(body.data.some((u: { email: string }) => u.email === "opt-inactive@nusa.id")).toBe(false)
    })
})

describe("GET /api/user/me", () => {
    test("requires authentication (401 without token)", async () => {
        const { status } = await request(app, "/api/user/me")
        expect(status).toBe(401)
    })

    test("returns the authenticated user's profile with offline presence by default", async () => {
        const { headers } = await createUserAndToken({ email: "me@nusa.id" })

        const { status, body } = await request(app, "/api/user/me", { headers })

        expect(status).toBe(200)
        expect(body.data.email).toBe("me@nusa.id")
        expect(body.data.availability).toBe("offline")
        expect(body.data.currentCallId).toBeNull()
    })
})

describe("GET /api/user/available", () => {
    test("is empty when nobody is online", async () => {
        const { headers } = await createUserAndToken()

        const { status, body } = await request(app, "/api/user/available", { headers })

        expect(status).toBe(200)
        expect(body.data).toEqual([])
    })

    test("lists users with a live connection and no active call", async () => {
        const { headers } = await createUserAndToken()
        const online = await seedUser({ email: "online@nusa.id" })
        presenceRegistry.register(online.email, "conn-1")

        const { status, body } = await request(app, "/api/user/available", { headers })

        expect(status).toBe(200)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].email).toBe("online@nusa.id")
        expect(body.data[0].availability).toBe("available")
    })

    test("excludes a user who is currently on a call", async () => {
        const { headers } = await createUserAndToken()
        const busy = await seedUser({ email: "busy@nusa.id" })
        presenceRegistry.register(busy.email, "conn-2")
        presenceRegistry.setCurrentCall(busy.email, 999)

        const { body } = await request(app, "/api/user/available", { headers })

        expect(body.data).toEqual([])
    })
})

describe("GET /api/user/:id", () => {
    test("returns a single user", async () => {
        const { headers } = await createUserAndToken()
        const seeded = await seedUser({ email: "show@nusa.id" })

        const { status, body } = await request(app, `/api/user/${seeded.id}`, { headers })

        expect(status).toBe(200)
        expect(body.data.email).toBe("show@nusa.id")
    })

    test("404s for a non-existent user", async () => {
        const { headers } = await createUserAndToken()

        const { status } = await request(app, "/api/user/999999", { headers })

        expect(status).toBe(404)
    })
})

describe("POST /api/user", () => {
    test("422s on an invalid payload", async () => {
        const { headers } = await createUserAndToken()

        const { status } = await request(app, "/api/user", { method: "POST", body: {}, headers })

        expect(status).toBe(422)
    })

    test("creates a user", async () => {
        const { headers } = await createUserAndToken()

        const { status, body } = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: { name: "New Agent", email: "new-agent@nusa.id", role: "agent", employeeId: 12345 },
        })

        expect(status).toBe(201)
        expect(body.data.email).toBe("new-agent@nusa.id")
        expect(body.data.name).toBe("New Agent")
    })

    test("rejects a duplicate email (400)", async () => {
        const { headers } = await createUserAndToken()
        await seedUser({ email: "dup@nusa.id" })

        const { status } = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: { name: "Dup", email: "dup@nusa.id", role: "agent", employeeId: 54321 },
        })

        expect(status).toBe(400)
    })
})

describe("PUT /api/user/:id", () => {
    test("updates a user's fields", async () => {
        const { headers } = await createUserAndToken()
        const seeded = await seedUser({ email: "before@nusa.id" })

        const { status, body } = await request(app, `/api/user/${seeded.id}`, {
            method: "PUT",
            headers,
            body: { name: "After Update" },
        })

        expect(status).toBe(200)
        expect(body.data.name).toBe("After Update")
        expect(body.data.email).toBe("before@nusa.id")
    })

    test("rejects a duplicate email (400)", async () => {
        const { headers } = await createUserAndToken()
        await seedUser({ email: "taken@nusa.id" })
        const seeded = await seedUser({ email: "movable@nusa.id" })

        const { status } = await request(app, `/api/user/${seeded.id}`, {
            method: "PUT",
            headers,
            body: { email: "taken@nusa.id" },
        })

        expect(status).toBe(400)
    })
})

describe("DELETE /api/user/:id", () => {
    test("soft-deletes a user — no longer listed or fetchable", async () => {
        const { headers } = await createUserAndToken()
        const seeded = await seedUser({ email: "to-delete@nusa.id" })

        const { status } = await request(app, `/api/user/${seeded.id}`, { method: "DELETE", headers })
        expect(status).toBe(200)

        const { status: showStatus } = await request(app, `/api/user/${seeded.id}`, { headers })
        expect(showStatus).toBe(404)
    })
})
