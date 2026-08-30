import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"
import { presenceRegistry } from "../src/modules/user/presence.registry"
import { getDataSource } from "../src/config/database"
import { Branch } from "../src/modules/branch/entities/branch.entity"

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
    for (const p of presenceRegistry.listAll()) {
        for (const connectionId of p.connectionIds) presenceRegistry.unregister(connectionId)
    }
})

async function seedUser(overrides: Partial<{ email: string; name: string; isActive: boolean; role: string; branchId: number }> = {}) {
    return await getUserService().save({
        email: overrides.email ?? `seed${Date.now()}${Math.floor(Math.random() * 1000)}@nusa.id`,
        name: overrides.name ?? "Seeded User",
        employeeId: Math.floor(Math.random() * 1_000_000),
        role: overrides.role ?? "agent",
        isActive: overrides.isActive ?? true,
        ...(overrides.branchId !== undefined ? { branchId: overrides.branchId } : {}),
    })
}

async function seedBranch(code: string, name: string): Promise<number> {
    const saved = await getDataSource().getRepository(Branch).save({ code, name })
    return saved.id
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

describe("GET /api/user/online", () => {
    test("kosong ketika tidak ada yang terhubung", async () => {
        const { headers } = await createUserAndToken()

        const { status, body } = await request(app, "/api/user/online", { headers })

        expect(status).toBe(200)
        expect(body.data).toEqual([])
    })

    test("tetap menyertakan agent yang sedang menelepon, tidak seperti available", async () => {
        const { headers } = await createUserAndToken()
        const busy = await seedUser({ email: "sibuk@nusa.id" })
        presenceRegistry.register(busy.email, "conn-online-1")
        presenceRegistry.setCurrentCall(busy.email, 77)

        const online = await request(app, "/api/user/online", { headers })
        const available = await request(app, "/api/user/available", { headers })

        expect(online.body.data).toHaveLength(1)
        expect(online.body.data[0].email).toBe("sibuk@nusa.id")
        expect(online.body.data[0].currentCallId).toBe(77)
        expect(available.body.data).toEqual([])
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

describe("GET /api/user — filter cabang", () => {
    test("branchId hanya mengembalikan agent pada cabang tersebut", async () => {
        const { headers } = await createUserAndToken()
        const bali = await seedBranch("062", "Bali")
        const medan = await seedBranch("020", "Medan")
        await seedUser({ email: "bali1@nusa.id", branchId: bali })
        await seedUser({ email: "bali2@nusa.id", branchId: bali })
        await seedUser({ email: "medan1@nusa.id", branchId: medan })

        const { status, body } = await request(app, `/api/user?branchId=${bali}`, { headers })

        expect(status).toBe(200)
        expect(body.meta.total).toBe(2)
        expect(body.data.every((u: { branch: { id: number } }) => u.branch.id === bali)).toBe(true)
    })

    test("tanpa branchId seluruh agent ikut terambil", async () => {
        const { headers } = await createUserAndToken()
        const bali = await seedBranch("062", "Bali")
        await seedUser({ email: "bali1@nusa.id", branchId: bali })
        await seedUser({ email: "tanpa-cabang@nusa.id" })

        const { body } = await request(app, "/api/user", { headers })

        expect(body.meta.total).toBeGreaterThanOrEqual(2)
    })
})

describe("GET /api/user — pengurutan cabang", () => {
    test("sortBy=branch mengurutkan berdasarkan nama cabang", async () => {
        const { headers } = await createUserAndToken()
        const zulu = await seedBranch("099", "Zulu")
        const alpha = await seedBranch("001", "Alpha")
        await seedUser({ email: "z@nusa.id", branchId: zulu })
        await seedUser({ email: "a@nusa.id", branchId: alpha })

        const asc = await request(app, "/api/user?sortBy=branch&order=ASC&branchId=", { headers })
        const names = asc.body.data
            .map((u: { branch: { name: string } | null }) => u.branch?.name)
            .filter(Boolean)

        expect(names[0]).toBe("Alpha")
        expect(names[names.length - 1]).toBe("Zulu")
    })
})

describe("GET /api/user — pengurutan status", () => {
    test("sortBy=availability menaruh yang online di atas", async () => {
        const { headers } = await createUserAndToken()
        await seedUser({ email: "offline1@nusa.id" })
        const online = await seedUser({ email: "online1@nusa.id" })
        await seedUser({ email: "offline2@nusa.id" })
        presenceRegistry.register(online.email, "conn-sort-1")

        const { status, body } = await request(app, "/api/user?sortBy=availability&order=ASC", { headers })

        expect(status).toBe(200)
        expect(body.data[0].email).toBe("online1@nusa.id")
        expect(body.data[0].availability).toBe("available")
    })

    test("sortBy=availability tetap 200 ketika tidak ada yang online", async () => {
        const { headers } = await createUserAndToken()
        await seedUser({ email: "offline3@nusa.id" })

        const { status, body } = await request(app, "/api/user?sortBy=availability&order=ASC", { headers })

        expect(status).toBe(200)
        expect(body.data.length).toBeGreaterThan(0)
    })
})
