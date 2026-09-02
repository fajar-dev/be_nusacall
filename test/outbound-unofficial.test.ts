import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test"

// ariClient adalah singleton module-level — dipalsukan sebelum modul manapun
// yang mengimpornya (termasuk signaling.module) dimuat, sama seperti pola di
// asterisk-call-handler.test.ts.
const fakeAriClient = {
    onStasisStart: () => {},
    onStasisEnd: () => {},
    onRecordingFinished: () => {},
    connect: () => {},
    originateChannel: async () => ({ id: "outbound-channel-1" }),
}

mock.module("../src/infrastructure/asterisk/ari.client", () => ({ ariClient: fakeAriClient }))

const { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } = await import("./setup")
const { getDataSource } = await import("../src/config/database")
const { Account } = await import("../src/modules/account/entities/account.entity")
const { Contact } = await import("../src/modules/contact/entities/contact.entity")

let app: Awaited<ReturnType<typeof createTestApp>>

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

describe("POST /api/call/outbound — akun unofficial", () => {
    test("langsung bisa menelepon tanpa izin Meta sama sekali", async () => {
        const account = await getDataSource().getRepository(Account).save({
            phoneNumberId: "999000111",
            businessAccountId: "fake-waba",
            displayPhoneNumber: "+62 811-0001-1122",
            label: "Simulator lokal",
            isOfficial: false,
        })
        const contact = await getDataSource().getRepository(Contact).save({
            phoneNumber: "628119990001",
            name: "Kontak Tes",
        })
        const { headers } = await createUserAndToken()

        // Tidak ada baris CallPermission sama sekali untuk kontak ini — kalau
        // akun ini masih dianggap official, endpoint akan menolak dengan 502
        // (checkPermission gagal karena tidak ada Meta app yang cocok).
        const { status, body } = await request(app, "/api/call/outbound", {
            method: "POST",
            body: { phoneNumberId: account.phoneNumberId, contactId: contact.id },
            headers,
        })

        expect(status).toBe(200)
        expect(body.data.wacid).toBe("outbound-channel-1")
    })
})
