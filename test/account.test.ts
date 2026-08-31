import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"
import { TypeOrmAccountRepository } from "../src/modules/account/repositories/account.repository"
import { AccountService } from "../src/modules/account/account.service"
import { getDataSource } from "../src/config/database"
import { Account } from "../src/modules/account/entities/account.entity"
import { CallIconVisibility } from "../src/modules/account/enums/call-icon-visibility.enum"
import type { MetaClient } from "../src/infrastructure/meta/meta.client"

let app: Hono
let repository: TypeOrmAccountRepository

beforeAll(async () => {
    await initTestDatabase()
    app = createTestApp()
    repository = new TypeOrmAccountRepository()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
})

async function seedAccount(overrides: Partial<Account> = {}): Promise<Account> {
    return await getDataSource().getRepository(Account).save({
        phoneNumberId: "202063559668129",
        businessAccountId: "252757097922101",
        displayPhoneNumber: "+62 819-8543-21",
        label: "Helpdesk Medan",
        callingEnabled: true,
        callIconVisibility: CallIconVisibility.DEFAULT,
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

describe("GET /api/account", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/account")
        expect(status).toBe(401)
    })

    test("lists accounts", async () => {
        const { headers } = await createUserAndToken()
        await seedAccount()

        const { status, body } = await request(app, "/api/account", { headers })

        expect(status).toBe(200)
        expect(body.data).toHaveLength(1)
        expect(body.data[0].label).toBe("Helpdesk Medan")
    })
})

describe("GET /api/account/:id", () => {
    test("404s for a non-existent account", async () => {
        const { headers } = await createUserAndToken()
        const { status } = await request(app, "/api/account/999999", { headers })
        expect(status).toBe(404)
    })

    test("returns a single account", async () => {
        const { headers } = await createUserAndToken()
        const account = await seedAccount()

        const { status, body } = await request(app, `/api/account/${account.id}`, { headers })

        expect(status).toBe(200)
        expect(body.data.phoneNumberId).toBe("202063559668129")
    })
})

describe("AccountService.update", () => {
    test("saves locally then pushes the FULL config to Meta", async () => {
        const account = await seedAccount({ callingEnabled: false })

        const sentCalling: Record<string, unknown>[] = []
        const service = new AccountService(
            repository,
            fakeMetaClient({ updateCallSettings: async (_id, calling) => { sentCalling.push(calling); return { success: true } } })
        )

        const updated = await service.update(account.id, { label: "Helpdesk Bandung", callingEnabled: true })

        expect(updated.label).toBe("Helpdesk Bandung")
        expect(updated.callingEnabled).toBe(true)
        expect(updated.lastSyncedAt).not.toBeNull()
        expect(sentCalling).toEqual([{ status: "ENABLED", call_icon_visibility: "DEFAULT" }])
    })

    test("does not lose the local save when Meta sync fails", async () => {
        const account = await seedAccount()
        const service = new AccountService(
            repository,
            fakeMetaClient({ updateCallSettings: async () => { throw new Error("Meta is down") } })
        )

        await expect(service.update(account.id, { label: "New Label" })).rejects.toThrow()

        const stored = await repository.findById(account.id)
        expect(stored!.label).toBe("New Label")
    })
})

describe("AccountService.sync", () => {
    test("re-pushes the current config and stamps lastSyncedAt", async () => {
        const account = await seedAccount()
        expect(account.lastSyncedAt).toBeNull()

        const service = new AccountService(repository, fakeMetaClient())
        const synced = await service.sync(account.id)

        expect(synced.lastSyncedAt).not.toBeNull()
    })
})

describe("AccountService.getHealth", () => {
    test("returns Meta's health status for the account", async () => {
        const account = await seedAccount()
        const service = new AccountService(repository, fakeMetaClient())

        const health = await service.getHealth(account.id)

        expect(health.health_status?.can_send_message).toBe("AVAILABLE")
    })
})
