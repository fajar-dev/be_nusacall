import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test"

// ariClient adalah singleton module-level, jadi dipalsukan lewat mock.module
// sebelum modul manapun yang mengimpornya (termasuk AsteriskCallHandlerService)
// dimuat — satu-satunya cara realistis mengendalikan sisi ARI tanpa Asterisk asli.
let stasisStartListener: ((event: any) => void) | null = null

const fakeAriClient = {
    onStasisStart: (cb: (event: any) => void) => { stasisStartListener = cb },
    onStasisEnd: () => {},
    connect: () => {},
    createBridge: async () => ({ id: "bridge-1" }),
    addChannelToBridge: async () => {},
    answerChannel: async () => {},
    hangupChannel: async () => {},
    recordBridge: async () => {},
    destroyBridge: async () => {},
    originateChannel: async () => ({ id: "agent-channel-1" }),
}

mock.module("../src/infrastructure/asterisk/ari.client", () => ({ ariClient: fakeAriClient }))

const { initTestDatabase, destroyTestDatabase, cleanTestDatabase } = await import("./setup")
const { TypeOrmCallRepository } = await import("../src/modules/call/repositories/call.repository")
const { TypeOrmCallEventRepository } = await import("../src/modules/call/repositories/call-event.repository")
const { CallStateService } = await import("../src/modules/call/call-state.service")
const { AsteriskCallHandlerService } = await import("../src/modules/call/asterisk-call-handler.service")
const { ContactService } = await import("../src/modules/contact/contact.service")
const { TypeOrmContactRepository } = await import("../src/modules/contact/repositories/contact.repository")
const { TypeOrmAccountRepository } = await import("../src/modules/account/repositories/account.repository")
const { CallStatus } = await import("../src/modules/call/enums/call-status.enum")
const { CallDirection } = await import("../src/modules/call/enums/call-direction.enum")

const TEST_PHONE_NUMBER_ID = "202063559668129"

let callRepository: InstanceType<typeof TypeOrmCallRepository>
let callStateService: InstanceType<typeof CallStateService>
let handler: InstanceType<typeof AsteriskCallHandlerService>

beforeAll(async () => {
    await initTestDatabase()
    callRepository = new TypeOrmCallRepository()
    callStateService = new CallStateService(callRepository, new TypeOrmCallEventRepository())
    handler = new AsteriskCallHandlerService(
        callStateService,
        callRepository,
        new ContactService(new TypeOrmContactRepository()),
        new TypeOrmAccountRepository(),
    )
    handler.start()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
})

/**
 * Panggilan masuk sudah aktif lebih dulu lewat CallSignalingService.handleAnswer
 * saat agent menekan angkat — StasisStart di sini hanya perlu membentuk bridge.
 */
describe("AsteriskCallHandlerService — bridging leg agent", () => {
    test("panggilan KELUAR ditandai ACTIVE saat agent tersambung, bukan tetap pending", async () => {
        const wacid = "wacid.OUTBOUND-BRIDGE1"
        await callStateService.findOrCreate(wacid, {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.OUTBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
        })

        await handler.connectAgent(wacid, 1)
        stasisStartListener!({ args: ["agent"], channel: { id: "agent-channel-1" } })
        await new Promise((r) => setTimeout(r, 50))

        const call = await callRepository.findByWacid(wacid)
        expect(call!.status).toBe(CallStatus.ACTIVE)
        expect(call!.answeredAt).not.toBeNull()
    })

    test("panggilan MASUK tidak disentuh statusnya di sini (sudah ACTIVE dari handleAnswer)", async () => {
        const wacid = "wacid.INBOUND-BRIDGE1"
        await callStateService.findOrCreate(wacid, {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.INBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
        })

        await handler.connectAgent(wacid, 1)
        stasisStartListener!({ args: ["agent"], channel: { id: "agent-channel-1" } })
        await new Promise((r) => setTimeout(r, 50))

        const call = await callRepository.findByWacid(wacid)
        expect(call!.status).toBe(CallStatus.PENDING)
    })
})
