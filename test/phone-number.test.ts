import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"
import { TypeOrmPhoneNumberRepository } from "../src/modules/phone-number/repositories/phone-number.repository"
import { PhoneNumberService } from "../src/modules/phone-number/phone-number.service"
import { getDataSource } from "../src/config/database"
import { PhoneNumber } from "../src/modules/phone-number/entities/phone-number.entity"
import type { MetaClient } from "../src/infrastructure/meta/meta.client"

// GET routes go through the real HTTP app (read-only, no Meta call). update/sync/health
// call Meta, so those exercise PhoneNumberService directly with a mocked MetaClient instead.

let app: Hono
let repository: TypeOrmPhoneNumberRepository

beforeAll(async () => {
    await initTestDatabase()
    app = createTestApp()
    repository = new TypeOrmPhoneNumberRepository()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
})

async function seedPhoneNumber(overrides: Partial<PhoneNumber> = {}): Promise<PhoneNumber> {
    return await getDataSource().getRepository(PhoneNumber).save({
        phoneNumberId: "202063559668129",
        businessAccountId: "252757097922101",
        displayPhoneNumber: "+62 819-8543-21",
        label: "Helpdesk Medan",
        isTestNumber: true,
        callingEnabled: true,
        callIconVisibility: "DEFAULT",
        answerTimeoutSeconds: 20,
        ...overrides,
    })
}

function fakeMetaClient(overrides: Partial<MetaClient> = {}): MetaClient {
    return {
        updateCallSettings: async () => ({ success: true }),
        getHealthStatus: async () => ({ id: "202063559668129", health_status: { can_send_message: "AVAILABLE" } }),
        ...overrides,
    } as unknown as MetaClient
}

describe("GET /api/phone-number", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/phone-number")
        expect(status).toBe(401)
    })

    test("lists phone numbers", async () => {
        const { headers } = await createUserAndToken()
        await seedPhoneNumber()

        const { status, body } = await request(app, "/api/phone-number", { headers })

        expect(status).toBe(200)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].label).toBe("Helpdesk Medan")
    })
})

describe("GET /api/phone-number/:id", () => {
    test("404s for a non-existent phone number", async () => {
        const { headers } = await createUserAndToken()
        const { status } = await request(app, "/api/phone-number/999999", { headers })
        expect(status).toBe(404)
    })

    test("returns a single phone number", async () => {
        const { headers } = await createUserAndToken()
        const phoneNumber = await seedPhoneNumber()

        const { status, body } = await request(app, `/api/phone-number/${phoneNumber.id}`, { headers })

        expect(status).toBe(200)
        expect(body.data.phoneNumberId).toBe("202063559668129")
    })
})

describe("PhoneNumberService.update", () => {
    test("saves locally then pushes the FULL config to Meta", async () => {
        const phoneNumber = await seedPhoneNumber({ callingEnabled: false })

        const sentCalling: Record<string, unknown>[] = []
        const service = new PhoneNumberService(
            repository,
            fakeMetaClient({ updateCallSettings: async (_id, calling) => { sentCalling.push(calling); return { success: true } } })
        )

        const updated = await service.update(phoneNumber.id, { label: "Helpdesk Bandung", callingEnabled: true })

        expect(updated.label).toBe("Helpdesk Bandung")
        expect(updated.callingEnabled).toBe(true)
        expect(updated.lastSyncedAt).not.toBeNull()
        expect(sentCalling).toEqual([{ status: "ENABLED", call_icon_visibility: "DEFAULT" }])
    })

    test("does not lose the local save when Meta sync fails", async () => {
        const phoneNumber = await seedPhoneNumber()
        const service = new PhoneNumberService(
            repository,
            fakeMetaClient({ updateCallSettings: async () => { throw new Error("Meta is down") } })
        )

        await expect(service.update(phoneNumber.id, { label: "New Label" })).rejects.toThrow()

        const stored = await repository.findById(phoneNumber.id)
        expect(stored!.label).toBe("New Label")
    })
})

describe("PhoneNumberService.sync", () => {
    test("re-pushes the current config and stamps lastSyncedAt", async () => {
        const phoneNumber = await seedPhoneNumber()
        expect(phoneNumber.lastSyncedAt).toBeNull()

        const service = new PhoneNumberService(repository, fakeMetaClient())
        const synced = await service.sync(phoneNumber.id)

        expect(synced.lastSyncedAt).not.toBeNull()
    })
})

describe("PhoneNumberService.getHealth", () => {
    test("returns Meta's health status for the phone number", async () => {
        const phoneNumber = await seedPhoneNumber()
        const service = new PhoneNumberService(repository, fakeMetaClient())

        const health = await service.getHealth(phoneNumber.id)

        expect(health.health_status?.can_send_message).toBe("AVAILABLE")
    })
})
