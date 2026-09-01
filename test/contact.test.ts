import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"
import { getDataSource } from "../src/config/database"
import { Contact } from "../src/modules/contact/entities/contact.entity"
import { ContactBranch } from "../src/modules/contact/entities/contact-branch.entity"
import { Branch } from "../src/modules/branch/entities/branch.entity"
import { ContactService } from "../src/modules/contact/contact.service"
import { TypeOrmContactRepository } from "../src/modules/contact/repositories/contact.repository"
import { normalizePhoneNumber } from "../src/core/helpers/phone-number"

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

async function seedContactWithBranches(phoneNumber: string, branchIds: number[]): Promise<Contact> {
    const contact = await getDataSource().getRepository(Contact).save({ phoneNumber, name: "Budi" })
    await getDataSource().getRepository(ContactBranch).insert(
        branchIds.map((branchId) => ({ contactId: contact.id, branchId }))
    )
    return contact
}

async function seedContact(overrides: Partial<Contact> = {}): Promise<Contact> {
    return await getDataSource().getRepository(Contact).save({
        phoneNumber: "628123456789",
        name: "Budi",
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
        expect(body.data[0].phoneNumber).toBe("628123456789")
        expect(body.data[0].name).toBe("Budi")
    })

    test("filters by wa_id or profile name via q", async () => {
        const { headers } = await createUserAndToken()
        await seedContact({ phoneNumber: "628111111111", name: "Budi" })
        await seedContact({ phoneNumber: "628222222222", name: "Siti" })

        const { body } = await request(app, "/api/contact?q=Siti", { headers })

        expect(body.data).toHaveLength(1)
        expect(body.data[0].name).toBe("Siti")
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
        expect(body.data.phoneNumber).toBe("628123456789")
    })
})

async function seedBranch(code: string, name: string): Promise<number> {
    const saved = await getDataSource().getRepository(Branch).save({ code, name })
    return saved.id
}

describe("POST /api/contact", () => {
    test("membutuhkan autentikasi", async () => {
        const { status } = await request(app, "/api/contact", { method: "POST", body: { phoneNumber: "628111222333" } })
        expect(status).toBe(401)
    })

    test("membuat kontak dengan timeZone default UTC dan cabang kosong", async () => {
        const { headers } = await createUserAndToken()

        const { status, body } = await request(app, "/api/contact", {
            method: "POST", headers, body: { phoneNumber: "628111222333", name: "Sari" },
        })

        expect(status).toBe(201)
        expect(body.data.phoneNumber).toBe("628111222333")
        expect(body.data.name).toBe("Sari")
        expect(body.data.timeZone).toBe("UTC")
        expect(body.data.branches).toEqual([])
    })

    test("menerima timeZone dan cabang", async () => {
        const { headers } = await createUserAndToken()
        const branchId = await seedBranch("020", "Medan")

        const { status, body } = await request(app, "/api/contact", {
            method: "POST", headers,
            body: { phoneNumber: "628111222444", name: "Andi", timeZone: "Asia/Jakarta", branchIds: [branchId] },
        })

        expect(status).toBe(201)
        expect(body.data.timeZone).toBe("Asia/Jakarta")
        expect(body.data.branches.map((b: { id: number }) => b.id)).toEqual([branchId])
    })

    test("menolak nomor telepon duplikat", async () => {
        const { headers } = await createUserAndToken()
        await seedContact({ phoneNumber: "628999888777" })

        const { status } = await request(app, "/api/contact", {
            method: "POST", headers, body: { phoneNumber: "628999888777" },
        })

        expect(status).toBe(400)
    })

    test("menolak nomor telepon tidak valid", async () => {
        const { headers } = await createUserAndToken()

        const { status } = await request(app, "/api/contact", {
            method: "POST", headers, body: { phoneNumber: "+62-812-abc" },
        })

        expect(status).toBe(422)
    })

    test("menolak timezone di luar daftar IANA", async () => {
        const { headers } = await createUserAndToken()

        const { status } = await request(app, "/api/contact", {
            method: "POST", headers, body: { phoneNumber: "628111222555", timeZone: "Mars/Olympus" },
        })

        expect(status).toBe(422)
    })
})

describe("PUT /api/contact/:id", () => {
    test("memperbarui nama, timezone, dan cabang", async () => {
        const { headers } = await createUserAndToken()
        const contact = await seedContact()
        const branchId = await seedBranch("062", "Bali")

        const { status, body } = await request(app, `/api/contact/${contact.id}`, {
            method: "PUT", headers, body: { name: "Budi Revisi", timeZone: "Asia/Makassar", branchIds: [branchId] },
        })

        expect(status).toBe(200)
        expect(body.data.name).toBe("Budi Revisi")
        expect(body.data.timeZone).toBe("Asia/Makassar")
        expect(body.data.branches.map((b: { id: number }) => b.id)).toEqual([branchId])
    })

    test("404 untuk kontak yang tidak ada", async () => {
        const { headers } = await createUserAndToken()
        const { status } = await request(app, "/api/contact/999999", { method: "PUT", headers, body: { name: "X" } })
        expect(status).toBe(404)
    })

    test("menolak nomor yang sudah dipakai kontak lain", async () => {
        const { headers } = await createUserAndToken()
        const first = await seedContact({ phoneNumber: "628100000001" })
        await seedContact({ phoneNumber: "628100000002" })

        const { status } = await request(app, `/api/contact/${first.id}`, {
            method: "PUT", headers, body: { phoneNumber: "628100000002" },
        })

        expect(status).toBe(400)
    })
})

describe("GET /api/contact — pengurutan", () => {
    test("sortBy=name mengurutkan berdasarkan nama", async () => {
        const { headers } = await createUserAndToken()
        await seedContact({ phoneNumber: "628200000001", name: "Zulkifli" })
        await seedContact({ phoneNumber: "628200000002", name: "Andi" })

        const { body } = await request(app, "/api/contact?sortBy=name&order=ASC", { headers })

        expect(body.data[0].name).toBe("Andi")
        expect(body.data[body.data.length - 1].name).toBe("Zulkifli")
    })

})

describe("GET /api/contact — filter cabang", () => {
    test("branchId hanya mengembalikan kontak pada cabang tersebut", async () => {
        const { headers } = await createUserAndToken()
        const bali = await seedBranch("062", "Bali")
        await seedContactWithBranches("628400000001", [bali])
        await seedContact({ phoneNumber: "628400000002" })

        const { body } = await request(app, `/api/contact?branchId=${bali}`, { headers })

        expect(body.meta.total).toBe(1)
        expect(body.data[0].branches[0].id).toBe(bali)
    })

    test("kontak dengan beberapa cabang muncul pada penyaringan tiap cabangnya", async () => {
        const { headers } = await createUserAndToken()
        const medan = await seedBranch("020", "Medan")
        const bali = await seedBranch("062", "Bali")
        await seedContactWithBranches("628400000003", [medan, bali])

        const perMedan = await request(app, `/api/contact?branchId=${medan}`, { headers })
        const perBali = await request(app, `/api/contact?branchId=${bali}`, { headers })

        expect(perMedan.body.meta.total).toBe(1)
        expect(perBali.body.meta.total).toBe(1)
        expect(perBali.body.data[0].branches).toHaveLength(2)
    })

    test("menyimpan beberapa cabang sekaligus lewat API", async () => {
        const { headers } = await createUserAndToken()
        const medan = await seedBranch("020", "Medan")
        const bali = await seedBranch("062", "Bali")

        const { status, body } = await request(app, "/api/contact", {
            method: "POST", headers,
            body: { phoneNumber: "628400000004", name: "Dedi", branchIds: [medan, bali] },
        })

        expect(status).toBe(201)
        expect(body.data.branches.map((b: { id: number }) => b.id).sort()).toEqual([medan, bali].sort())
    })
})

describe("DELETE /api/contact/:id", () => {
    test("menghapus kontak", async () => {
        const { headers } = await createUserAndToken()
        const contact = await seedContact()

        const { status } = await request(app, `/api/contact/${contact.id}`, { method: "DELETE", headers })
        expect(status).toBe(200)

        const after = await request(app, `/api/contact/${contact.id}`, { headers })
        expect(after.status).toBe(404)
    })
})

describe("normalizePhoneNumber", () => {
    test("mengubah awalan nol menjadi kode negara", () => {
        expect(normalizePhoneNumber("08123456789")).toBe("628123456789")
    })

    test("membuang tanda plus, spasi, dan tanda hubung", () => {
        expect(normalizePhoneNumber("+62 812-3456-789")).toBe("628123456789")
    })

    test("membuang awalan panggilan internasional nol nol", () => {
        expect(normalizePhoneNumber("00628123456789")).toBe("628123456789")
    })

    test("membiarkan nomor yang sudah berformat internasional", () => {
        expect(normalizePhoneNumber("628123456789")).toBe("628123456789")
    })
})

describe("ContactService.findOrCreate", () => {
    let contacts: ContactService

    beforeEach(() => {
        contacts = new ContactService(new TypeOrmContactRepository())
    })

    test("memakai kontak yang sudah ada, bukan membuat yang baru", async () => {
        const existing = await seedContact({ phoneNumber: "628123456789", name: "Budi" })

        const resolved = await contacts.findOrCreate("628123456789", "Nama Dari Meta")

        expect(resolved.id).toBe(existing.id)
        expect(resolved.name).toBe("Budi")
        expect(await getDataSource().getRepository(Contact).count()).toBe(1)
    })

    test("kontak yang ditambahkan manual dengan awalan nol tetap dipakai saat ada panggilan", async () => {
        const { headers } = await createUserAndToken()
        const { body } = await request(app, "/api/contact", {
            method: "POST", headers, body: { phoneNumber: "08123456789", name: "Budi" },
        })

        const resolved = await contacts.findOrCreate("628123456789", "Nama Dari Meta")

        expect(resolved.id).toBe(body.data.id)
        expect(await getDataSource().getRepository(Contact).count()).toBe(1)
    })

    test("membuat kontak baru ketika nomornya memang belum terdaftar", async () => {
        const resolved = await contacts.findOrCreate("628999999999", "Dedi")

        expect(resolved.phoneNumber).toBe("628999999999")
        expect(await getDataSource().getRepository(Contact).count()).toBe(1)
    })

    test("panggilan berulang dari nomor yang sama tidak menambah kontak", async () => {
        const first = await contacts.findOrCreate("628999999999", "Dedi")
        const second = await contacts.findOrCreate("628999999999", "Dedi Berubah")

        expect(second.id).toBe(first.id)
        expect(await getDataSource().getRepository(Contact).count()).toBe(1)
    })
})
