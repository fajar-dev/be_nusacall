import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase } from "./setup"
import { TypeOrmCallPermissionRepository } from "../src/modules/permission/repositories/call-permission.repository"
import { PermissionService } from "../src/modules/permission/permission.service"
import { PermissionStatus } from "../src/modules/permission/enum/permission-status.enum"
import { config } from "../src/config/config"
import type { MetaClient } from "../src/infrastructure/meta/meta.client"

// Real DB, fake Meta — a live call_permissions check hits the Graph API with its
// own rate limit, so we never call it from tests.

function fakeMetaClient(overrides: Partial<MetaClient> = {}): MetaClient {
    return {
        getCallPermission: async () => ({
            messaging_product: "whatsapp",
            permission: { status: "no_permission" },
            actions: [],
        }),
        sendCallPermissionRequest: async () => ({ messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.fake" }] }),
        ...overrides,
    } as unknown as MetaClient
}

let repository: TypeOrmCallPermissionRepository

beforeAll(async () => {
    await initTestDatabase()
    repository = new TypeOrmCallPermissionRepository()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
})

describe("PermissionService.checkPermission", () => {
    test("calls Meta and caches the result on a first check", async () => {
        let calls = 0
        const meta = fakeMetaClient({
            getCallPermission: async () => { calls++; return { messaging_product: "whatsapp", permission: { status: "permanent" }, actions: [] } },
        })
        const service = new PermissionService(repository, meta)

        const result = await service.checkPermission("202063559668129", "628123456789")

        expect(calls).toBe(1)
        expect(result.permission.status).toBe(PermissionStatus.PERMANENT)
        expect(result.quota).toEqual([])
    })

    test("serves from cache within the TTL window — does not call Meta again", async () => {
        let calls = 0
        const meta = fakeMetaClient({
            getCallPermission: async () => { calls++; return { messaging_product: "whatsapp", permission: { status: "temporary", expiration_time: Math.floor(Date.now() / 1000) + 3600 }, actions: [] } },
        })
        const service = new PermissionService(repository, meta)

        await service.checkPermission("202063559668129", "628123456789")
        const second = await service.checkPermission("202063559668129", "628123456789")

        expect(calls).toBe(1)
        expect(second.permission.status).toBe(PermissionStatus.TEMPORARY)
        expect(second.quota).toBeNull() // cache hits don't carry fresh quota numbers
    })

    test("re-checks Meta once the cache TTL has expired", async () => {
        let calls = 0
        const meta = fakeMetaClient({
            getCallPermission: async () => { calls++; return { messaging_product: "whatsapp", permission: { status: "permanent" }, actions: [] } },
        })
        const service = new PermissionService(repository, meta)
        await service.checkPermission("202063559668129", "628123456789")

        // Simulate the TTL having passed by backdating checkedAt directly.
        const row = await repository.findByContact("202063559668129", "628123456789")
        await repository.upsertStatus("202063559668129", "628123456789", row!.status, row!.expiresAt ?? null, new Date(Date.now() - (config.outbound.permissionCacheTtlSeconds + 5) * 1000))

        await service.checkPermission("202063559668129", "628123456789")
        expect(calls).toBe(2)
    })
})

describe("PermissionService.requestPermission", () => {
    test("throws when no template is configured rather than silently failing", async () => {
        const original = config.outbound.permissionTemplateName
        config.outbound.permissionTemplateName = ""
        try {
            const service = new PermissionService(repository, fakeMetaClient())
            await expect(service.requestPermission("202063559668129", "628123456789")).rejects.toThrow()
        } finally {
            config.outbound.permissionTemplateName = original
        }
    })

    test("sends the template and records lastRequestedAt", async () => {
        const original = config.outbound.permissionTemplateName
        config.outbound.permissionTemplateName = "call_permission_request"
        try {
            const captured: { waId?: string } = {}
            const meta = fakeMetaClient({
                sendCallPermissionRequest: async (_pn: string, waId: string) => { captured.waId = waId; return { messaging_product: "whatsapp", contacts: [], messages: [{ id: "wamid.1" }] } },
            })
            const service = new PermissionService(repository, meta)

            await service.requestPermission("202063559668129", "628123456789")

            expect(captured.waId).toBe("628123456789")
            const row = await repository.findByContact("202063559668129", "628123456789")
            expect(row!.lastRequestedAt).not.toBeNull()
        } finally {
            config.outbound.permissionTemplateName = original
        }
    })
})
