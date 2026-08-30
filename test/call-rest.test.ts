import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"
import { getDataSource } from "../src/config/database"
import { Call } from "../src/modules/call/entities/call.entity"
import { CallRecording } from "../src/modules/call/entities/call-recording.entity"
import { CallStatus } from "../src/modules/call/enums/call-status.enum"
import { Account } from "../src/modules/account/entities/account.entity"
import { CallDirection } from "../src/modules/call/enums/call-direction.enum"
import { EndReason } from "../src/modules/call/enums/end-reason.enum"
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

async function seedContact(phoneNumber: string, name: string): Promise<number> {
    const saved = await getDataSource().getRepository(Contact).save({ phoneNumber, name })
    return saved.id
}

async function seedCall(overrides: Partial<Call> = {}): Promise<Call> {
    return await getDataSource().getRepository(Call).save({
        wacid: `wacid.REST${Date.now()}${Math.random()}`,
        phoneNumberId: "202063559668129",
        direction: CallDirection.INBOUND,
        status: CallStatus.COMPLETED,
        statusRank: 90,
        durationSeconds: 120,
        ...overrides,
    })
}

async function seedAccount(phoneNumberId: string, label: string, displayPhoneNumber: string) {
    return await getDataSource().getRepository(Account).save({
        phoneNumberId, label, displayPhoneNumber,
        businessAccountId: "252757097922101",
    })
}

describe("GET /api/call - akun dan pengurutan", () => {
    test("menyertakan label dan nomor akun pada setiap panggilan", async () => {
        const { headers } = await createUserAndToken()
        await seedAccount("202063559668129", "Helpdesk Medan", "+62 819-8543-21")
        await seedCall()

        const { body } = await request(app, "/api/call", { headers })

        expect(body.data[0].account.label).toBe("Helpdesk Medan")
        expect(body.data[0].account.displayPhoneNumber).toBe("+62 819-8543-21")
    })

    test("akun bernilai null ketika phone_number_id tidak terdaftar", async () => {
        const { headers } = await createUserAndToken()
        await seedCall({ phoneNumberId: "999999999999" })

        const { body } = await request(app, "/api/call", { headers })

        expect(body.data[0].account).toBeNull()
    })

    test("dapat diurutkan berdasarkan label akun", async () => {
        const { headers } = await createUserAndToken()
        await seedAccount("111", "Zulu", "+62 1")
        await seedAccount("222", "Alfa", "+62 2")
        await seedCall({ phoneNumberId: "111" })
        await seedCall({ phoneNumberId: "222" })

        const { body } = await request(app, "/api/call?sortBy=account&order=ASC", { headers })

        expect(body.data.map((c: { account: { label: string } }) => c.account.label)).toEqual(["Alfa", "Zulu"])
    })

    test("dapat diurutkan berdasarkan nama kontak", async () => {
        const { headers } = await createUserAndToken()
        const repo = getDataSource().getRepository(Contact)
        const zaki = await repo.save({ phoneNumber: "628900000001", name: "Zaki" })
        const andi = await repo.save({ phoneNumber: "628900000002", name: "Andi" })
        await seedCall({ contactId: zaki.id })
        await seedCall({ contactId: andi.id })

        const { body } = await request(app, "/api/call?sortBy=contact&order=ASC", { headers })

        expect(body.data.map((c: { contact: { name: string } }) => c.contact.name)).toEqual(["Andi", "Zaki"])
    })

    test("dapat disaring berdasarkan kontak", async () => {
        const { headers } = await createUserAndToken()
        const repo = getDataSource().getRepository(Contact)
        const budi = await repo.save({ phoneNumber: "628700000001", name: "Budi" })
        const dedi = await repo.save({ phoneNumber: "628700000002", name: "Dedi" })
        await seedCall({ contactId: budi.id })
        await seedCall({ contactId: budi.id })
        await seedCall({ contactId: dedi.id })

        const { body } = await request(app, `/api/call?contactId=${budi.id}`, { headers })

        expect(body.meta.total).toBe(2)
        expect(body.data.every((c: { contact: { id: number } }) => c.contact.id === budi.id)).toBe(true)
    })

    test("dapat diurutkan berdasarkan durasi", async () => {
        const { headers } = await createUserAndToken()
        await seedCall({ durationSeconds: 300 })
        await seedCall({ durationSeconds: 60 })

        const { body } = await request(app, "/api/call?sortBy=durationSeconds&order=ASC", { headers })

        expect(body.data.map((c: { durationSeconds: number }) => c.durationSeconds)).toEqual([60, 300])
    })
})

describe("GET /api/call", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/call")
        expect(status).toBe(401)
    })

    test("lists calls, paginated", async () => {
        const { headers } = await createUserAndToken()
        await seedCall()
        await seedCall()

        const { status, body } = await request(app, "/api/call?page=1&limit=10", { headers })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(2)
        expect(body.meta.total).toBe(2)
    })

    test("filters by status", async () => {
        const { headers } = await createUserAndToken()
        await seedCall({ status: CallStatus.COMPLETED, statusRank: 90 })
        await seedCall({ status: CallStatus.MISSED, statusRank: 90 })

        const { body } = await request(app, "/api/call?status=missed", { headers })

        expect(body.data).toHaveLength(1)
        expect(body.data[0].status).toBe("missed")
    })

    test("searches by contact phone number/name/wacid", async () => {
        const { headers } = await createUserAndToken()
        const a = await seedContact("628111111111", "Satu")
        const b = await seedContact("628222222222", "Dua")
        await seedCall({ contactId: a })
        await seedCall({ contactId: b })

        const { body } = await request(app, "/api/call?q=628111111111", { headers })

        expect(body.data).toHaveLength(1)
        expect(body.data[0].contact.phoneNumber).toBe("628111111111")
    })
})

describe("GET /api/call/:id", () => {
    test("returns a single call", async () => {
        const { headers } = await createUserAndToken()
        const call = await seedCall()

        const { status, body } = await request(app, `/api/call/${call.id}`, { headers })

        expect(status).toBe(200)
        expect(body.data.wacid).toBe(call.wacid)
    })

    test("404s for a non-existent call", async () => {
        const { headers } = await createUserAndToken()
        const { status } = await request(app, "/api/call/999999", { headers })
        expect(status).toBe(404)
    })
})

describe("GET /api/call/stats", () => {
    test("aggregates totals by outcome", async () => {
        const { headers } = await createUserAndToken()
        await seedCall({ status: CallStatus.COMPLETED, statusRank: 90, durationSeconds: 100 })
        await seedCall({ status: CallStatus.COMPLETED, statusRank: 90, durationSeconds: 200 })
        await seedCall({ status: CallStatus.MISSED, statusRank: 90, durationSeconds: null, endReason: EndReason.NO_AGENT_AVAILABLE })

        const { status, body } = await request(app, "/api/call/stats", { headers })

        expect(status).toBe(200)
        expect(body.data.total).toBe(3)
        expect(body.data.answered).toBe(2)
        expect(body.data.missed).toBe(1)
        expect(body.data.avgDurationSeconds).toBe(150)
    })

    test("memisahkan hitungan panggilan masuk dan keluar", async () => {
        const { headers } = await createUserAndToken()
        await seedCall({ direction: CallDirection.INBOUND })
        await seedCall({ direction: CallDirection.INBOUND })
        await seedCall({ direction: CallDirection.OUTBOUND })

        const { body } = await request(app, "/api/call/stats", { headers })

        expect(body.data.inbound).toBe(2)
        expect(body.data.outbound).toBe(1)
        expect(body.data.total).toBe(3)
    })
})

describe("GET /api/call/:id/recording", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/call/1/recording")
        expect(status).toBe(401)
    })

    test("404s when the call has no recording row at all", async () => {
        const { headers } = await createUserAndToken()
        const call = await seedCall()
        const { status } = await request(app, `/api/call/${call.id}/recording`, { headers })
        expect(status).toBe(404)
    })

    test("404s when a row exists but no track was stored", async () => {
        const { headers } = await createUserAndToken()
        const call = await seedCall()
        await getDataSource().getRepository(CallRecording).save({
            callId: call.id, durationSeconds: 0,
        })
        const { status } = await request(app, `/api/call/${call.id}/recording`, { headers })
        expect(status).toBe(404)
    })

    test("mengembalikan satu URL bertanda tangan untuk rekaman gabungan", async () => {
        const { headers } = await createUserAndToken()
        const call = await seedCall()
        await getDataSource().getRepository(CallRecording).save({
            callId: call.id, durationSeconds: 42,
            s3Key: `recordings/2026/08/24/${call.wacid}.opus`,
        })
        const { status, body } = await request(app, `/api/call/${call.id}/recording`, { headers })
        expect(status).toBe(200)
        expect(typeof body.data.url).toBe("string")
        expect(body.data.durationSeconds).toBe(42)
    })

    test("404 ketika baris rekaman ada tetapi berkasnya tidak tersimpan", async () => {
        const { headers } = await createUserAndToken()
        const call = await seedCall()
        await getDataSource().getRepository(CallRecording).save({
            callId: call.id, durationSeconds: 0, s3Key: null,
        })
        const { status } = await request(app, `/api/call/${call.id}/recording`, { headers })
        expect(status).toBe(404)
    })
})

