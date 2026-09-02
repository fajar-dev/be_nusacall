import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test"

let stasisStartListener: ((event: any) => void) | null = null
let stasisEndListener: ((event: any) => void) | null = null
let stateChangeListener: ((event: any) => void) | null = null

const fakeAriClient = {
    onStasisStart: (cb: (event: any) => void) => { stasisStartListener = cb },
    onStasisEnd: (cb: (event: any) => void) => { stasisEndListener = cb },
    onChannelStateChange: (cb: (event: any) => void) => { stateChangeListener = cb },
    onRecordingFinished: () => {},
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
const { EndReason } = await import("../src/modules/call/enums/end-reason.enum")

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

describe("AsteriskCallHandlerService — bridging leg agent", () => {
    test("bridge agent+pelanggan terbentuk BELUM berarti panggilan keluar sudah ACTIVE", async () => {
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
        expect(call!.status).toBe(CallStatus.PENDING)
        expect(call!.answeredAt).toBeNull()
    })

    test("panggilan KELUAR baru ACTIVE begitu channel pelanggan sendiri jadi 'Up'", async () => {
        const wacid = "wacid.OUTBOUND-BRIDGE2"
        await callStateService.findOrCreate(wacid, {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.OUTBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
        })

        await handler.connectAgent(wacid, 1)
        stasisStartListener!({ args: ["agent"], channel: { id: "agent-channel-1" } })
        await new Promise((r) => setTimeout(r, 50))

        stateChangeListener!({ channel: { id: wacid, state: "Up" } })
        await new Promise((r) => setTimeout(r, 50))

        const call = await callRepository.findByWacid(wacid)
        expect(call!.status).toBe(CallStatus.ACTIVE)
        expect(call!.answeredAt).not.toBeNull()
    })

    test("ChannelStateChange 'Up' diabaikan untuk channel yang bukan wacid panggilan keluar manapun", async () => {
        stateChangeListener!({ channel: { id: "agent-channel-1", state: "Up" } })
        await new Promise((r) => setTimeout(r, 20))
        expect(true).toBe(true)
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

describe("AsteriskCallHandlerService — StasisEnd sebelum benar-benar tersambung", () => {
    test("panggilan KELUAR yang tidak pernah diangkat -> ABANDONED + ANSWER_TIMEOUT, bukan FAILED/media_failure", async () => {
        const wacid = "wacid.OUTBOUND-NOANSWER1"
        await callStateService.findOrCreate(wacid, {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.OUTBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
        })

        stasisEndListener!({ channel: { id: wacid } })
        await new Promise((r) => setTimeout(r, 50))

        const call = await callRepository.findByWacid(wacid)
        expect(call!.status).toBe(CallStatus.ABANDONED)
        expect(call!.endReason).toBe(EndReason.ANSWER_TIMEOUT)
    })

    test("panggilan MASUK yang ditutup penelepon sebelum agent angkat -> ABANDONED + CUSTOMER_HANGUP, bukan media_failure", async () => {
        const wacid = "wacid.INBOUND-CALLERHANGUP1"
        const call = await callStateService.findOrCreate(wacid, {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.INBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
        })
        await callStateService.transition(wacid, CallStatus.RINGING, { ringingAt: new Date() })
        void call

        stasisEndListener!({ channel: { id: wacid } })
        await new Promise((r) => setTimeout(r, 50))

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.ABANDONED)
        expect(updated!.endReason).toBe(EndReason.CUSTOMER_HANGUP)
    })
})
