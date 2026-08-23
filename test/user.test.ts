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
// Authentication Required — All user routes need auth
// ═══════════════════════════════════════════════════════════════════════════

describe("User - Auth Required", () => {
    test("GET /api/user should fail without auth", async () => {
        const { status, body } = await request(app, "/api/user")
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("POST /api/user should fail without auth", async () => {
        const { status, body } = await request(app, "/api/user", {
            method: "POST",
            body: createUserData(),
        })
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("GET /api/user/:id should fail without auth", async () => {
        const { status, body } = await request(app, "/api/user/1")
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("PUT /api/user/:id should fail without auth", async () => {
        const { status, body } = await request(app, "/api/user/1", {
            method: "PUT",
            body: { name: "Updated" },
        })
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("DELETE /api/user/:id should fail without auth", async () => {
        const { status, body } = await request(app, "/api/user/1", {
            method: "DELETE",
        })
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("POST /api/upload should fail without auth", async () => {
        const res = await app.request("/api/upload", {
            method: "POST",
            body: new FormData(),
        })
        expect(res.status).toBe(401)
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/user — Create
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/user", () => {
    test("should create a user successfully", async () => {
        const { headers } = await registerAndLogin(app)
        const userData = createUserData()

        const { status, body } = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: userData,
        })

        expect(status).toBe(201)
        expect(body.success).toBe(true)
        expect(body.message).toBe("User created successfully")
        expect(body.data).toBeDefined()
        expect(body.data.name).toBe(userData.name)
        expect(body.data.email).toBe(userData.email)
        expect(body.data.photo).toBeNull()
        expect(body.data.isActive).toBe(true) // default
        expect(body.data.id).toBeDefined()
        expect(body.data.createdAt).toBeDefined()
    })

    test("should fail validation without name", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: { email: "test@example.com", password: "password123" },
        })

        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })

    test("should fail validation with invalid email", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: { name: "Test", email: "not-an-email", password: "password123" },
        })

        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })

    test("should fail validation with short password", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: { name: "Test", email: "test@example.com", password: "123" },
        })

        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })

    test("should fail if email already in use", async () => {
        const { headers, user } = await registerAndLogin(app) // this creates the first user

        const { status, body } = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: {
                name: "Another User",
                email: user.email, // duplicate
                password: "password123",
            },
        })

        expect(status).toBe(400)
        expect(body.success).toBe(false)
        expect(body.message).toBe("Email already in use")
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/user — List
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/user", () => {
    test("should return list containing at least the logged in user", async () => {
        const { headers, user } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/user", {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("Users retrieved successfully")
        expect(body.data).toBeArray()
        expect(body.data.length).toBeGreaterThanOrEqual(1)
        expect(body.meta).toBeDefined()
        expect(body.meta.total).toBeGreaterThanOrEqual(1)

        const foundMe = body.data.find((u: any) => u.id === user.id)
        expect(foundMe).toBeDefined()
        expect(foundMe.name).toBe(user.name)
        expect(foundMe.email).toBe(user.email)
    })

    test("should search users by name or email", async () => {
        const { headers } = await registerAndLogin(app)

        await request(app, "/api/user", {
            method: "POST",
            headers,
            body: { name: "Alice Cooper", email: "cooper@example.com", password: "password123" },
        })
        await request(app, "/api/user", {
            method: "POST",
            headers,
            body: { name: "Bob Dylan", email: "dylan@example.com", password: "password123" },
        })

        const { body } = await request(app, "/api/user?q=Cooper", {
            method: "GET",
            headers,
        })

        expect(body.data.length).toBe(1)
        expect(body.data[0].name).toBe("Alice Cooper")
    })

    test("should sort by name ascending", async () => {
        const { headers } = await registerAndLogin(app)

        await request(app, "/api/user", { method: "POST", headers, body: { name: "Zed Sortable", email: "zed-sort@example.com", password: "password123" } })
        await request(app, "/api/user", { method: "POST", headers, body: { name: "Amy Sortable", email: "amy-sort@example.com", password: "password123" } })
        await request(app, "/api/user", { method: "POST", headers, body: { name: "Milo Sortable", email: "milo-sort@example.com", password: "password123" } })

        const { status, body } = await request(app, "/api/user?q=Sortable&sortBy=name&order=ASC", {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.data.map((u: any) => u.name)).toEqual(["Amy Sortable", "Milo Sortable", "Zed Sortable"])
    })

    test("should sort by name descending", async () => {
        const { headers } = await registerAndLogin(app)

        await request(app, "/api/user", { method: "POST", headers, body: { name: "Zed Sortable", email: "zed-sort@example.com", password: "password123" } })
        await request(app, "/api/user", { method: "POST", headers, body: { name: "Amy Sortable", email: "amy-sort@example.com", password: "password123" } })
        await request(app, "/api/user", { method: "POST", headers, body: { name: "Milo Sortable", email: "milo-sort@example.com", password: "password123" } })

        const { body } = await request(app, "/api/user?q=Sortable&sortBy=name&order=DESC", {
            method: "GET",
            headers,
        })

        expect(body.data.map((u: any) => u.name)).toEqual(["Zed Sortable", "Milo Sortable", "Amy Sortable"])
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/user/:id — Show
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/user/:id", () => {
    test("should return user by ID", async () => {
        const { headers } = await registerAndLogin(app)
        const userData = createUserData()

        const createRes = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: userData,
        })
        const userId = createRes.body.data.id

        const { status, body } = await request(app, `/api/user/${userId}`, {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("User retrieved successfully")
        expect(body.data.id).toBe(userId)
        expect(body.data.name).toBe(userData.name)
        expect(body.data.email).toBe(userData.email)
    })

    test("should return 404 for non-existent user", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/user/99999", {
            method: "GET",
            headers,
        })

        expect(status).toBe(404)
        expect(body.success).toBe(false)
        expect(body.message).toBe("User not found")
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/user/:id — Update
// ═══════════════════════════════════════════════════════════════════════════

describe("PUT /api/user/:id", () => {
    test("should update user details successfully", async () => {
        const { headers } = await registerAndLogin(app)

        const createRes = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: createUserData(),
        })
        const userId = createRes.body.data.id

        const { status, body } = await request(app, `/api/user/${userId}`, {
            method: "PUT",
            headers,
            body: { name: "Updated Name", isActive: false },
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("User updated successfully")
        expect(body.data.name).toBe("Updated Name")
        expect(body.data.isActive).toBe(false)
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/user/:id — Destroy
// ═══════════════════════════════════════════════════════════════════════════

describe("DELETE /api/user/:id", () => {
    test("should delete user successfully", async () => {
        const { headers } = await registerAndLogin(app)

        const createRes = await request(app, "/api/user", {
            method: "POST",
            headers,
            body: createUserData(),
        })
        const userId = createRes.body.data.id

        const { status, body } = await request(app, `/api/user/${userId}`, {
            method: "DELETE",
            headers,
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("User deleted successfully")

        // Verify it's deleted
        const { status: getStatus } = await request(app, `/api/user/${userId}`, {
            method: "GET",
            headers,
        })
        expect(getStatus).toBe(404)
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/upload — Upload File
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/upload", () => {
    test("should upload a file successfully and return path", async () => {
        const { accessToken } = await registerAndLogin(app)

        const formData = new FormData()
        const fileContent = "dummy image data"
        const fileBlob = new Blob([fileContent], { type: "image/png" })
        formData.append("file", fileBlob, "avatar.png")

        const res = await app.request("/api/upload", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
        })

        const body = await res.json() as any

        expect(res.status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("File uploaded successfully")
        expect(body.data.path).toBeDefined()
        expect(body.data.path).toStartWith("users/")
        expect(body.data.path).toEndWith(".png")
    })
})
