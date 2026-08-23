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
import { createContactData, resetCounters } from "./helpers"

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
// Authentication Required — All contact routes need auth
// ═══════════════════════════════════════════════════════════════════════════

describe("Contact - Auth Required", () => {
    test("GET /api/contact should fail without auth", async () => {
        const { status, body } = await request(app, "/api/contact")
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("POST /api/contact should fail without auth", async () => {
        const { status, body } = await request(app, "/api/contact", {
            method: "POST",
            body: createContactData(),
        })
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("GET /api/contact/:id should fail without auth", async () => {
        const { status, body } = await request(app, "/api/contact/1")
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("PUT /api/contact/:id should fail without auth", async () => {
        const { status, body } = await request(app, "/api/contact/1", {
            method: "PUT",
            body: { name: "Updated" },
        })
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("DELETE /api/contact/:id should fail without auth", async () => {
        const { status, body } = await request(app, "/api/contact/1", {
            method: "DELETE",
        })
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/contact — Create
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/contact", () => {
    test("should create a contact successfully", async () => {
        const { headers } = await registerAndLogin(app)
        const contactData = createContactData()

        const { status, body } = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: contactData,
        })

        expect(status).toBe(201)
        expect(body.success).toBe(true)
        expect(body.message).toBe("Contact created successfully")
        expect(body.data).toBeDefined()
        expect(body.data.name).toBe(contactData.name)
        expect(body.data.email).toBe(contactData.email)
        expect(body.data.phone).toBe(contactData.phone)
        expect(body.data.id).toBeDefined()
        expect(body.data.createdAt).toBeDefined()
        expect(body.data.updatedAt).toBeDefined()
    })

    test("should create a contact with only name", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: { name: "Minimal Contact" },
        })

        expect(status).toBe(201)
        expect(body.data.name).toBe("Minimal Contact")
        expect(body.data.email).toBeNull()
        expect(body.data.phone).toBeNull()
        expect(body.data.salutation).toBeNull()
        expect(body.data.type).toBe("customer")
        expect(body.data.isActive).toBe(true)
    })

    test("should create a contact with salutation, type, and isActive", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: createContactData({ salutation: "mrs", type: "vendor", isActive: false }),
        })

        expect(status).toBe(201)
        expect(body.data.salutation).toBe("mrs")
        expect(body.data.type).toBe("vendor")
        expect(body.data.isActive).toBe(false)
    })

    test("should fail validation without name", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: { email: "test@example.com" },
        })

        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })

    test("should fail validation with invalid email", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: { name: "Test", email: "not-an-email" },
        })

        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/contact — List
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/contact", () => {
    test("should return empty list with pagination meta", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/contact", {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("Contacts retrieved successfully")
        expect(body.data).toBeArray()
        expect(body.data.length).toBe(0)
        expect(body.meta).toBeDefined()
        expect(body.meta.total).toBe(0)
        expect(body.meta.currentPage).toBe(1)
        expect(body.meta.perPage).toBe(10)
    })

    test("should return list with created contacts", async () => {
        const { headers } = await registerAndLogin(app)

        // Create 3 contacts
        for (let i = 0; i < 3; i++) {
            await request(app, "/api/contact", {
                method: "POST",
                headers,
                body: createContactData(),
            })
        }

        const { status, body } = await request(app, "/api/contact", {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.data.length).toBe(3)
        expect(body.meta.total).toBe(3)
    })

    test("should paginate correctly", async () => {
        const { headers } = await registerAndLogin(app)

        // Create 5 contacts
        for (let i = 0; i < 5; i++) {
            await request(app, "/api/contact", {
                method: "POST",
                headers,
                body: createContactData(),
            })
        }

        // Page 1, limit 2
        const { body: page1 } = await request(app, "/api/contact?page=1&limit=2", {
            method: "GET",
            headers,
        })

        expect(page1.data.length).toBe(2)
        expect(page1.meta.total).toBe(5)
        expect(page1.meta.currentPage).toBe(1)
        expect(page1.meta.perPage).toBe(2)
        expect(page1.meta.lastPage).toBe(3)

        // Page 3, limit 2 (should have 1 item)
        const { body: page3 } = await request(app, "/api/contact?page=3&limit=2", {
            method: "GET",
            headers,
        })

        expect(page3.data.length).toBe(1)
        expect(page3.meta.currentPage).toBe(3)
    })

    test("should search contacts by name", async () => {
        const { headers } = await registerAndLogin(app)

        await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: { name: "Alice Johnson" },
        })
        await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: { name: "Bob Smith" },
        })
        await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: { name: "Alice Williams" },
        })

        const { body } = await request(app, "/api/contact?q=Alice", {
            method: "GET",
            headers,
        })

        expect(body.data.length).toBe(2)
        expect(body.meta.total).toBe(2)
    })

    test("should sort by name ascending", async () => {
        const { headers } = await registerAndLogin(app)

        await request(app, "/api/contact", { method: "POST", headers, body: { name: "Charlie" } })
        await request(app, "/api/contact", { method: "POST", headers, body: { name: "Alice" } })
        await request(app, "/api/contact", { method: "POST", headers, body: { name: "Bob" } })

        const { status, body } = await request(app, "/api/contact?sortBy=name&order=ASC", {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.data.map((c: any) => c.name)).toEqual(["Alice", "Bob", "Charlie"])
    })

    test("should sort by name descending", async () => {
        const { headers } = await registerAndLogin(app)

        await request(app, "/api/contact", { method: "POST", headers, body: { name: "Charlie" } })
        await request(app, "/api/contact", { method: "POST", headers, body: { name: "Alice" } })
        await request(app, "/api/contact", { method: "POST", headers, body: { name: "Bob" } })

        const { body } = await request(app, "/api/contact?sortBy=name&order=DESC", {
            method: "GET",
            headers,
        })

        expect(body.data.map((c: any) => c.name)).toEqual(["Charlie", "Bob", "Alice"])
    })

    test("should default to id DESC when sortBy is not a sortable column", async () => {
        const { headers } = await registerAndLogin(app)

        const first = await request(app, "/api/contact", { method: "POST", headers, body: { name: "First" } })
        const second = await request(app, "/api/contact", { method: "POST", headers, body: { name: "Second" } })

        const { status, body } = await request(app, "/api/contact?sortBy=password", {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.data[0].id).toBe(second.body.data.id)
        expect(body.data[1].id).toBe(first.body.data.id)
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/contact/:id — Show
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/contact/:id", () => {
    test("should return contact by ID", async () => {
        const { headers } = await registerAndLogin(app)
        const contactData = createContactData()

        // Create contact
        const createRes = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: contactData,
        })
        const contactId = createRes.body.data.id

        // Get by ID
        const { status, body } = await request(app, `/api/contact/${contactId}`, {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("Contact retrieved successfully")
        expect(body.data.id).toBe(contactId)
        expect(body.data.name).toBe(contactData.name)
        expect(body.data.email).toBe(contactData.email)
        expect(body.data.phone).toBe(contactData.phone)
    })

    test("should return 404 for non-existent contact", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/contact/99999", {
            method: "GET",
            headers,
        })

        expect(status).toBe(404)
        expect(body.success).toBe(false)
        expect(body.message).toBe("Contact not found")
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/contact/:id — Update
// ═══════════════════════════════════════════════════════════════════════════

describe("PUT /api/contact/:id", () => {
    test("should update contact successfully", async () => {
        const { headers } = await registerAndLogin(app)

        // Create contact
        const createRes = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: createContactData(),
        })
        const contactId = createRes.body.data.id

        // Update
        const { status, body } = await request(app, `/api/contact/${contactId}`, {
            method: "PUT",
            headers,
            body: { name: "Updated Name", email: "updated@example.com" },
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("Contact updated successfully")
        expect(body.data.name).toBe("Updated Name")
        expect(body.data.email).toBe("updated@example.com")
    })

    test("should update salutation, type, and isActive", async () => {
        const { headers } = await registerAndLogin(app)

        const createRes = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: createContactData(),
        })
        const contactId = createRes.body.data.id

        const { status, body } = await request(app, `/api/contact/${contactId}`, {
            method: "PUT",
            headers,
            body: { name: "Updated Contact", salutation: "mr", type: "supplier", isActive: false },
        })

        expect(status).toBe(200)
        expect(body.data.salutation).toBe("mr")
        expect(body.data.type).toBe("supplier")
        expect(body.data.isActive).toBe(false)
    })

    test("should update partial fields only", async () => {
        const { headers } = await registerAndLogin(app)
        const originalData = createContactData()

        // Create contact
        const createRes = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: originalData,
        })
        const contactId = createRes.body.data.id

        // Update only name
        const { status, body } = await request(app, `/api/contact/${contactId}`, {
            method: "PUT",
            headers,
            body: { name: "Only Name Updated" },
        })

        expect(status).toBe(200)
        expect(body.data.name).toBe("Only Name Updated")
        // Other fields should remain unchanged
        expect(body.data.email).toBe(originalData.email)
        expect(body.data.phone).toBe(originalData.phone)
    })

    test("should return 404 for non-existent contact", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/contact/99999", {
            method: "PUT",
            headers,
            body: { name: "Test" },
        })

        expect(status).toBe(404)
        expect(body.success).toBe(false)
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/contact/:id — Destroy
// ═══════════════════════════════════════════════════════════════════════════

describe("DELETE /api/contact/:id", () => {
    test("should delete contact successfully", async () => {
        const { headers } = await registerAndLogin(app)

        // Create contact
        const createRes = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: createContactData(),
        })
        const contactId = createRes.body.data.id

        // Delete
        const { status, body } = await request(app, `/api/contact/${contactId}`, {
            method: "DELETE",
            headers,
        })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.message).toBe("Contact deleted successfully")

        // Verify it's deleted
        const { status: getStatus } = await request(app, `/api/contact/${contactId}`, {
            method: "GET",
            headers,
        })
        expect(getStatus).toBe(404)
    })

    test("should return 404 for non-existent contact", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/contact/99999", {
            method: "DELETE",
            headers,
        })

        expect(status).toBe(404)
        expect(body.success).toBe(false)
    })
})

// ═══════════════════════════════════════════════════════════════════════════
// Full CRUD Lifecycle Integration Test
// ═══════════════════════════════════════════════════════════════════════════

describe("Contact Full CRUD Lifecycle", () => {
    test("Create → Read → Update → Read → Delete → Verify Deleted", async () => {
        const { headers } = await registerAndLogin(app)
        const contactData = createContactData()

        // 1. CREATE
        const createRes = await request(app, "/api/contact", {
            method: "POST",
            headers,
            body: contactData,
        })
        expect(createRes.status).toBe(201)
        const contactId = createRes.body.data.id
        expect(contactId).toBeDefined()

        // 2. READ — verify created data
        const readRes = await request(app, `/api/contact/${contactId}`, {
            method: "GET",
            headers,
        })
        expect(readRes.status).toBe(200)
        expect(readRes.body.data.name).toBe(contactData.name)
        expect(readRes.body.data.email).toBe(contactData.email)
        expect(readRes.body.data.phone).toBe(contactData.phone)

        // 3. UPDATE
        const updateRes = await request(app, `/api/contact/${contactId}`, {
            method: "PUT",
            headers,
            body: { name: "Updated Contact", phone: "08999999999" },
        })
        expect(updateRes.status).toBe(200)
        expect(updateRes.body.data.name).toBe("Updated Contact")
        expect(updateRes.body.data.phone).toBe("08999999999")
        // Email should remain unchanged
        expect(updateRes.body.data.email).toBe(contactData.email)

        // 4. READ — verify updated data
        const readRes2 = await request(app, `/api/contact/${contactId}`, {
            method: "GET",
            headers,
        })
        expect(readRes2.body.data.name).toBe("Updated Contact")
        expect(readRes2.body.data.phone).toBe("08999999999")

        // 5. Verify appears in list
        const listRes = await request(app, "/api/contact", {
            method: "GET",
            headers,
        })
        expect(listRes.body.data.length).toBe(1)
        expect(listRes.body.meta.total).toBe(1)

        // 6. DELETE
        const deleteRes = await request(app, `/api/contact/${contactId}`, {
            method: "DELETE",
            headers,
        })
        expect(deleteRes.status).toBe(200)

        // 7. VERIFY DELETED — should 404
        const readRes3 = await request(app, `/api/contact/${contactId}`, {
            method: "GET",
            headers,
        })
        expect(readRes3.status).toBe(404)

        // 8. Verify list is empty
        const listRes2 = await request(app, "/api/contact", {
            method: "GET",
            headers,
        })
        expect(listRes2.body.data.length).toBe(0)
        expect(listRes2.body.meta.total).toBe(0)
    })
})
