import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase } from "./setup"
import { getDataSource } from "../src/config/database"
import { Account } from "../src/modules/account/entities/account.entity"
import { TypeOrmCallPermissionRepository } from "../src/modules/permission/repositories/call-permission.repository"
import { PermissionService } from "../src/modules/permission/permission.service"
import { PermissionStatus } from "../src/modules/permission/enums/permission-status.enum"
import { config } from "../src/config/config"
import { ContactService } from "../src/modules/contact/contact.service"
import { TypeOrmContactRepository } from "../src/modules/contact/repositories/contact.repository"
import type { MetaClient } from "../src/infrastructure/meta/meta.client"

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
let contacts: ContactService

beforeAll(async () => {
    await initTestDatabase()
    repository = new TypeOrmCallPermissionRepository()
    contacts = new ContactService(new TypeOrmContactRepository())
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
        const service = new PermissionService(repository, meta, contacts)

        const result = await service.checkPermission("202063559668129", (await contacts.findOrCreate("628123456789", null)).id)

        expect(calls).toBe(1)
        expect(result.permission.status).toBe(PermissionStatus.PERMANENT)
        expect(result.quota).toEqual([])
    })

    test("serves from cache within the TTL window — does not call Meta again", async () => {
        let calls = 0
        const meta = fakeMetaClient({
            getCallPermission: async () => { calls++; return { messaging_product: "whatsapp", permission: { status: "temporary", expiration_time: Math.floor(Date.now() / 1000) + 3600 }, actions: [] } },
        })
        const service = new PermissionService(repository, meta, contacts)

        await service.checkPermission("202063559668129", (await contacts.findOrCreate("628123456789", null)).id)
        const second = await service.checkPermission("202063559668129", (await contacts.findOrCreate("628123456789", null)).id)

        expect(calls).toBe(1)
        expect(second.permission.status).toBe(PermissionStatus.TEMPORARY)
        expect(second.quota).toBeNull() // cache hits don't carry fresh quota numbers
    })

    test("re-checks Meta once the cache TTL has expired", async () => {
        let calls = 0
        const meta = fakeMetaClient({
            getCallPermission: async () => { calls++; return { messaging_product: "whatsapp", permission: { status: "permanent" }, actions: [] } },
        })
        const service = new PermissionService(repository, meta, contacts)
        await service.checkPermission("202063559668129", (await contacts.findOrCreate("628123456789", null)).id)

        const row = await repository.findByContact("202063559668129", (await contacts.findOrCreate("628123456789", null)).id)
        await repository.upsertStatus("202063559668129", (await contacts.findOrCreate("628123456789", null)).id, row!.status, row!.expiresAt ?? null, new Date(Date.now() - (config.outbound.permissionCacheTtlSeconds + 5) * 1000))

        await service.checkPermission("202063559668129", (await contacts.findOrCreate("628123456789", null)).id)
        expect(calls).toBe(2)
    })
})

import type { NusawaClient } from "../src/infrastructure/nusawa/nusawa.client"

function fakeNusawaClient(overrides: Partial<NusawaClient> = {}): NusawaClient {
    return {
        sendCallPermissionRequest: async () => ({ success: true }),
        ...overrides,
    } as unknown as NusawaClient
}

describe("PermissionService.requestPermission", () => {
    async function seedAccount(phoneNumberId: string, templateName: string | null, language: string | null = "id") {
        return await getDataSource().getRepository(Account).save({
            phoneNumberId,
            businessAccountId: "252757097922101",
            label: "Uji",
            displayPhoneNumber: "628198543210",
            permissionTemplateName: templateName,
            permissionTemplateLanguage: language,
        })
    }

    test("menolak ketika akun belum memilih template", async () => {
        await seedAccount("202063559668129", null)
        const service = new PermissionService(repository, fakeMetaClient(), contacts, fakeNusawaClient())
        const kontak = await contacts.findOrCreate("628123456789", null)

        await expect(service.requestPermission("202063559668129", kontak.id)).rejects.toThrow()
    })

    test("mengirim template milik akun dan mencatat waktu permintaannya", async () => {
        await seedAccount("202063559668129", "izin_panggilan", "id")
        const captured: { waId?: string; template?: string; language?: string } = {}
        const nusawa = fakeNusawaClient({
            sendCallPermissionRequest: async (_pn: string, waId: string, template: string, language: string) => {
                captured.waId = waId
                captured.template = template
                captured.language = language
                return { success: true }
            },
        })
        const service = new PermissionService(repository, fakeMetaClient(), contacts, nusawa)
        const kontak = await contacts.findOrCreate("628123456789", null)

        await service.requestPermission("202063559668129", kontak.id)

        expect(captured.waId).toBe("628123456789")
        expect(captured.template).toBe("izin_panggilan")
        expect(captured.language).toBe("id")
        const row = await repository.findByContact("202063559668129", kontak.id)
        expect(row!.lastRequestedAt).not.toBeNull()
    })

    test("memakai en_US ketika bahasanya belum diisi", async () => {
        await seedAccount("202063559668129", "izin_panggilan", null)
        const captured: { language?: string } = {}
        const nusawa = fakeNusawaClient({
            sendCallPermissionRequest: async (_pn: string, _wa: string, _t: string, language: string) => {
                captured.language = language
                return { success: true }
            },
        })
        const service = new PermissionService(repository, fakeMetaClient(), contacts, nusawa)

        await service.requestPermission("202063559668129", (await contacts.findOrCreate("628123456789", null)).id)

        expect(captured.language).toBe("en_US")
    })
})
