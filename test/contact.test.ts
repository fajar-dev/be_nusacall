import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"
import { getDataSource } from "../src/config/database"
import { Contact } from "../src/modules/contact/entities/contact.entity"

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

async function seedContact(overrides: Partial<Contact> = {}): Promise<Contact> {
    return await getDataSource().getRepository(Contact).save({
        waId: "628123456789",
        profileName: "Budi",
        ...overrides,
    })
}

describe("GET /api/contact", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/contact")
        expect(status).toBe(401)
    })

    test("lists contacts", async () => {
        const { headers } = await createUserAndToken()
        await seedContact()

        const { status, body } = await request(app, "/api/contact", { headers })

        expect(status).toBe(200)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].waId).toBe("628123456789")
        expect(body.data[0].profileName).toBe("Budi")
    })

    test("filters by wa_id or profile name via q", async () => {
        const { headers } = await createUserAndToken()
        await seedContact({ waId: "628111111111", profileName: "Budi" })
        await seedContact({ waId: "628222222222", profileName: "Siti" })

        const { body } = await request(app, "/api/contact?q=Siti", { headers })

        expect(body.data).toHaveLength(1)
        expect(body.data[0].profileName).toBe("Siti")
    })
})

describe("GET /api/contact/:id", () => {
    test("404s for a non-existent contact", async () => {
        const { headers } = await createUserAndToken()
        const { status } = await request(app, "/api/contact/999999", { headers })
        expect(status).toBe(404)
    })

    test("returns a single contact", async () => {
        const { headers } = await createUserAndToken()
        const contact = await seedContact()

        const { status, body } = await request(app, `/api/contact/${contact.id}`, { headers })

        expect(status).toBe(200)
        expect(body.data.waId).toBe("628123456789")
    })
})
