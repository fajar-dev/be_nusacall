import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createUserAndToken } from "./setup"
import { createStatusWebhookPayload } from "./helpers"
import { TypeOrmCallRepository } from "../src/modules/call/repositories/call.repository"
import { TypeOrmCallEventRepository } from "../src/modules/call/repositories/call-event.repository"
import { CallStateService } from "../src/modules/call/call-state.service"
import { CallSignalingService } from "../src/modules/call/call-signaling.service"
import { WebhookService } from "../src/modules/webhook/webhook.service"
import { ContactService } from "../src/modules/contact/contact.service"
import { TypeOrmContactRepository } from "../src/modules/contact/repositories/contact.repository"
import { TypeOrmAccountRepository } from "../src/modules/account/repositories/account.repository"
import { Account } from "../src/modules/account/entities/account.entity"
import { CallIconVisibility } from "../src/modules/account/enums/call-icon-visibility.enum"
import { RoutingService } from "../src/modules/routing/routing.service"
import { CallStatus } from "../src/modules/call/enums/call-status.enum"
import { CallDirection } from "../src/modules/call/enums/call-direction.enum"
import { EndReason } from "../src/modules/call/enums/end-reason.enum"
import { presenceRegistry } from "../src/modules/user/presence.registry"
import { getDataSource } from "../src/config/database"
import { config } from "../src/config/config"
import type { IAsteriskCallControl } from "../src/modules/call/interfaces/asterisk-call-control.interface"
import type { NusawaLogService } from "../src/modules/call/nusawa-log.service"
import type { IAgentNotifier, WsOutboundPacket } from "../src/modules/call/interfaces/call-signaling.interface"

const TEST_PHONE_NUMBER_ID = "202063559668129"

class FakeNotifier implements IAgentNotifier {
    sent: { email: string; packet: WsOutboundPacket }[] = []

    send(email: string, packet: WsOutboundPacket): void {
        this.sent.push({ email, packet })
    }

    sendToAgents(emails: string[], packet: WsOutboundPacket): void {
        for (const email of emails) this.send(email, packet)
    }

    broadcast(): void {
    }

    packetsFor(email: string): WsOutboundPacket[] {
        return this.sent.filter((s) => s.email === email).map((s) => s.packet)
    }
}

function fakeAsteriskControl(overrides: Partial<IAsteriskCallControl> = {}): IAsteriskCallControl {
    return {
        connectAgent: async () => {},
        hangupChannel: async () => {},
        originateOutbound: async () => ({ wacid: `wacid.OUT${Date.now()}` }),
        ...overrides,
    }
}

function fakeNusawaLog(): { enqueued: unknown[]; service: NusawaLogService } {
    const enqueued: unknown[] = []
    const service = { enqueue: async (input: unknown) => { enqueued.push(input) } } as unknown as NusawaLogService
    return { enqueued, service }
}

let callRepository: TypeOrmCallRepository
let callStateService: CallStateService
let contactService: ContactService
let accountRepository: TypeOrmAccountRepository
let agent1Id: number
let agent2Id: number

beforeAll(async () => {
    await initTestDatabase()
    callRepository = new TypeOrmCallRepository()
    callStateService = new CallStateService(callRepository, new TypeOrmCallEventRepository())
    contactService = new ContactService(new TypeOrmContactRepository())
    accountRepository = new TypeOrmAccountRepository()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
    for (const p of presenceRegistry.listAll()) {
        for (const connectionId of p.connectionIds) presenceRegistry.unregister(connectionId)
    }
    agent1Id = (await createUserAndToken({ email: "agent1@nusa.id" })).user.id
    agent2Id = (await createUserAndToken({ email: "agent2@nusa.id" })).user.id
    await getDataSource().getRepository(Account).save({
        phoneNumberId: TEST_PHONE_NUMBER_ID,
        businessAccountId: "252757097922101",
        displayPhoneNumber: "+62 819-8543-21",
        label: "Test Account",
        callingEnabled: true,
        callIconVisibility: CallIconVisibility.DEFAULT,
    })
})

function newSignalingService(notifier: IAgentNotifier, asterisk: IAsteriskCallControl = fakeAsteriskControl()) {
    return new CallSignalingService(
        notifier, callRepository, callStateService, asterisk,
        new RoutingService(), fakeNusawaLog().service, contactService, accountRepository,
    )
}

async function createRingingCall(wacid: string) {
    const call = await callStateService.findOrCreate(wacid, {
        phoneNumberId: TEST_PHONE_NUMBER_ID,
        direction: CallDirection.INBOUND,
        status: CallStatus.PENDING,
        statusRank: 10,
    })

    await callStateService.transition(wacid, CallStatus.RINGING, { ringingAt: new Date() })
    presenceRegistry.register("agent1@nusa.id", "conn-1")
    presenceRegistry.setCurrentCall("agent1@nusa.id", call.id)

    return call
}

describe("CallSignalingService.notifyIncoming", () => {
    test("menyertakan nama dan nomor kontak pada notifikasi panggilan masuk", async () => {
        presenceRegistry.register("agent1@nusa.id", "conn-1")
        const contact = await contactService.findOrCreate("628111222333", "Budi Santoso")
        const call = await callStateService.findOrCreate("wacid.SIGCONTACT1", {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            contactId: contact.id,
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        await newSignalingService(notifier).notifyIncoming(call)

        const incoming = notifier.packetsFor("agent1@nusa.id")[0]
        const data = incoming?.data as { name: string | null; phoneNumber: string | null }
        expect(data.name).toBe("Budi Santoso")
        expect(data.phoneNumber).toBe("628111222333")
    })

    test("tetap mengantre ketika satu-satunya agent sedang menelepon", async () => {
        presenceRegistry.register("agent1@nusa.id", "conn-1")
        presenceRegistry.setCurrentCall("agent1@nusa.id", 999)

        const call = await callStateService.findOrCreate("wacid.SIGBUSY1", {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        await newSignalingService(notifier).notifyIncoming(call)

        const updated = await callRepository.findByWacid("wacid.SIGBUSY1")
        expect(updated!.status).toBe(CallStatus.RINGING)
        expect(notifier.packetsFor("agent1@nusa.id").some(p => p.type === "incoming_call")).toBe(true)
    })

    test("tidak menimpa panggilan aktif agent yang sedang sibuk", async () => {
        presenceRegistry.register("agent1@nusa.id", "conn-1")
        presenceRegistry.setCurrentCall("agent1@nusa.id", 999)

        const call = await callStateService.findOrCreate("wacid.SIGBUSY2", {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        await newSignalingService(new FakeNotifier()).notifyIncoming(call)

        expect(presenceRegistry.get("agent1@nusa.id")!.currentCallId).toBe(999)
    })

    test("rings every available agent and transitions the call to RINGING", async () => {
        presenceRegistry.register("agent1@nusa.id", "conn-1")
        const call = await callStateService.findOrCreate("wacid.SIGRING1", {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        await newSignalingService(notifier).notifyIncoming(call)

        const updated = await callRepository.findByWacid("wacid.SIGRING1")
        expect(updated!.status).toBe(CallStatus.RINGING)
        const incoming = notifier.packetsFor("agent1@nusa.id")[0]
        expect(incoming?.type).toBe("incoming_call")
        const expiresAt = (incoming?.data as { expiresAt: number }).expiresAt
        expect(expiresAt).toBeGreaterThan(Date.now())
    })

    test("marks the call MISSED when no agent is available, and tells Asterisk to hang up (not just local cleanup)", async () => {
        const call = await callStateService.findOrCreate("wacid.SIGMISSED1", {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const hungUp: string[] = []
        const notifier = new FakeNotifier()
        const service = newSignalingService(notifier, fakeAsteriskControl({
            hangupChannel: async (id) => { hungUp.push(id) },
        }))
        await service.notifyIncoming(call)

        expect(hungUp).toEqual(["wacid.SIGMISSED1"])
        const updated = await callRepository.findByWacid("wacid.SIGMISSED1")
        expect(updated!.status).toBe(CallStatus.MISSED)
    })

    test("still marks the call MISSED even if the Asterisk hangup call itself fails", async () => {
        const call = await callStateService.findOrCreate("wacid.SIGMISSED2", {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        const service = newSignalingService(notifier, fakeAsteriskControl({
            hangupChannel: async () => { throw new Error("Asterisk is down") },
        }))
        await service.notifyIncoming(call)

        const updated = await callRepository.findByWacid("wacid.SIGMISSED2")
        expect(updated!.status).toBe(CallStatus.MISSED)
    })

    test("menutup channel Asterisk juga kalau tidak ada yang mengangkat sampai timeout habis", async () => {
        const originalTimeout = config.call.answerTimeoutSeconds
        config.call.answerTimeoutSeconds = 0.05

        try {
            const call = await callStateService.findOrCreate("wacid.SIGRINGTIMEOUT1", {
                phoneNumberId: TEST_PHONE_NUMBER_ID,
                direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
            })
            presenceRegistry.register("agent1@nusa.id", "conn-timeout")

            const hungUp: Array<{ wacid: string; reason?: string }> = []
            const notifier = new FakeNotifier()
            const service = newSignalingService(notifier, fakeAsteriskControl({
                hangupChannel: async (wacid, reason) => { hungUp.push({ wacid, reason }) },
            }))
            await service.notifyIncoming(call)

            await new Promise((resolve) => setTimeout(resolve, 150))

            expect(hungUp).toEqual([{ wacid: "wacid.SIGRINGTIMEOUT1", reason: "no_answer" }])
            const updated = await callRepository.findByWacid("wacid.SIGRINGTIMEOUT1")
            expect(updated!.status).toBe(CallStatus.MISSED)
            expect(updated!.endReason).toBe("answer_timeout")
        } finally {
            config.call.answerTimeoutSeconds = originalTimeout
        }
    })
})

describe("CallSignalingService.handleAnswer", () => {
    test("menandai agent sedang menelepon meski panggilannya diambil dari antrean", async () => {
        const wacid = "wacid.SIGCLAIM1"
        await createRingingCall(wacid)
        const call = await callRepository.findByWacid(wacid)
        presenceRegistry.setCurrentCall("agent1@nusa.id", null)

        const service = newSignalingService(new FakeNotifier())

        await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid)

        expect(presenceRegistry.get("agent1@nusa.id")!.currentCallId).toBe(call!.id)
    })

    test("wires the agent's SDP, calls Asterisk acceptCall, and activates the call", async () => {
        const wacid = "wacid.SIGANSWER1"
        await createRingingCall(wacid)

        const acceptedIds: string[] = []
        const notifier = new FakeNotifier()
        const service = newSignalingService(notifier, fakeAsteriskControl({
            connectAgent: async (id) => { acceptedIds.push(id) },
        }))

        await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid)

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.ACTIVE)
        expect(updated!.userId).toBe(agent1Id)
        expect(acceptedIds).toEqual([wacid])

        const packets = notifier.packetsFor("agent1@nusa.id").map((p) => p.type)
        expect(packets).toContain("call_state")
    })

    test("stamps the Call row with recordingEnabled as actually requested on accept", async () => {
        const original = { recording: config.recording.recordingEnabled }
        config.recording.recordingEnabled = true
        try {
            const wacid = "wacid.SIGANSWERRECORD1"
            await createRingingCall(wacid)
            const service = newSignalingService(new FakeNotifier())

            await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid)

            const updated = await callRepository.findByWacid(wacid)
            expect(updated!.recordingEnabled).toBe(true)
        } finally {
            config.recording.recordingEnabled = original.recording
        }
    })

    test("second agent to answer gets call_taken instead of stealing the call", async () => {
        const wacid = "wacid.SIGANSWER2"
        await createRingingCall(wacid)
        presenceRegistry.register("agent2@nusa.id", "conn-2")
        presenceRegistry.setCurrentCall("agent2@nusa.id", (await callRepository.findByWacid(wacid))!.id)

        const notifier = new FakeNotifier()
        const service = newSignalingService(notifier)

        await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid)
        await service.handleAnswer(agent2Id, "agent2@nusa.id", wacid)

        const agent2Packets = notifier.packetsFor("agent2@nusa.id")
        expect(agent2Packets.some((p) => p.type === "call_taken")).toBe(true)

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.userId).toBe(agent1Id)
    })

    test("notifies other ringing agents that the call was taken once one agent answers", async () => {
        const wacid = "wacid.SIGANSWER3"
        await createRingingCall(wacid)
        const call = (await callRepository.findByWacid(wacid))!
        presenceRegistry.register("agent2@nusa.id", "conn-2")
        presenceRegistry.setCurrentCall("agent2@nusa.id", call.id)

        const notifier = new FakeNotifier()
        const service = newSignalingService(notifier)

        await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid)

        const agent2Packets = notifier.packetsFor("agent2@nusa.id")
        expect(agent2Packets.some((p) => p.type === "call_taken")).toBe(true)
        expect(presenceRegistry.get("agent2@nusa.id")?.currentCallId).toBeNull()
    })

    test("transitions to FAILED when Asterisk's acceptCall throws", async () => {
        const wacid = "wacid.SIGANSWERFAIL1"
        await createRingingCall(wacid)

        const notifier = new FakeNotifier()
        const service = newSignalingService(notifier, fakeAsteriskControl({
            connectAgent: async () => { throw new Error("Asterisk could not reach the agent softphone") },
        }))

        await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid)

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.FAILED)
        expect(notifier.packetsFor("agent1@nusa.id").some((p) => p.type === "call_ended")).toBe(true)
    })
})

describe("CallSignalingService.initiateOutbound", () => {
    test("creates the Call row, claims presence, and returns the wacid ARI assigned", async () => {
        presenceRegistry.register("agent1@nusa.id", "conn-out1")
        const service = newSignalingService(new FakeNotifier(), fakeAsteriskControl({
            originateOutbound: async () => ({ wacid: "wacid.OUT1" }),
        }))

        const outContact = await contactService.findOrCreate("628999888777", null)
        const result = await service.initiateOutbound(agent1Id, "agent1@nusa.id", TEST_PHONE_NUMBER_ID, outContact.id)

        expect(result.wacid).toBe("wacid.OUT1")

        const call = await callRepository.findByWacid("wacid.OUT1")
        expect(call).not.toBeNull()
        expect(call!.direction).toBe(CallDirection.OUTBOUND)
        expect(call!.userId).toBe(agent1Id)
        expect(presenceRegistry.get("agent1@nusa.id")?.currentCallId).toBe(call!.id)
    })

    test("creates no Call row when originate fails", async () => {
        const service = newSignalingService(new FakeNotifier(), fakeAsteriskControl({
            originateOutbound: async () => { throw new Error("Asterisk originate failed") },
        }))

        const failContact = await contactService.findOrCreate("628999888777", null)
        await expect(service.initiateOutbound(agent1Id, "agent1@nusa.id", TEST_PHONE_NUMBER_ID, failContact.id)).rejects.toThrow()

        const call = await callRepository.findByWacid("628999888777")
        expect(call).toBeNull()
    })
})

describe("CallSignalingService.handleReject / handleHangup", () => {
    test("handleReject calls Asterisk hangupChannel and marks the call REJECTED", async () => {
        const wacid = "wacid.SIGREJECT1"
        await createRingingCall(wacid)

        const hungUp: string[] = []
        const notifier = new FakeNotifier()
        const nusawaLog = fakeNusawaLog()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeAsteriskControl({ hangupChannel: async (id) => { hungUp.push(id) } }),
            new RoutingService(), nusawaLog.service, contactService, accountRepository,
        )

        await service.handleReject("agent1@nusa.id", wacid, "busy")

        expect(hungUp).toEqual([wacid])
        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.REJECTED)
        expect(nusawaLog.enqueued).toHaveLength(1)
        expect((nusawaLog.enqueued[0] as { body: string }).body).toContain("ditolak")
    })

    test("handleReject tidak menimpa panggilan yang sudah diklaim agent lain (race antar-agent)", async () => {
        const wacid = "wacid.SIGREJECTRACE1"
        await createRingingCall(wacid)
        // agent2 sudah lebih dulu klaim panggilan ini sebelum klik "Tolak" agent1 diproses.
        await callStateService.transition(wacid, CallStatus.CONNECTING, { userId: agent1Id })

        const hungUp: string[] = []
        const service = newSignalingService(new FakeNotifier(), fakeAsteriskControl({
            hangupChannel: async (id) => { hungUp.push(id) },
        }))

        await service.handleReject("agent2@nusa.id", wacid, "busy")

        expect(hungUp).toEqual([])
        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.CONNECTING)
    })

    test("handleHangup menyimpan durasi panggilan, bukan meninggalkannya null", async () => {
        const wacid = "wacid.SIGHANGUPDUR"
        await createRingingCall(wacid)
        await callStateService.transition(wacid, CallStatus.CONNECTING, { userId: agent1Id })
        await callStateService.transition(wacid, CallStatus.ACTIVE, {
            answeredAt: new Date(Date.now() - 45_000),
        })

        const service = newSignalingService(new FakeNotifier())

        await service.handleHangup("agent1@nusa.id", wacid)

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.durationSeconds).not.toBeNull()
        expect(updated!.durationSeconds).toBeGreaterThanOrEqual(44)
        expect(updated!.durationSeconds).toBeLessThanOrEqual(47)
    })

    test("handleHangup calls Asterisk hangupChannel and marks the call COMPLETED", async () => {
        const wacid = "wacid.SIGHANGUP1"
        await createRingingCall(wacid)
        await callStateService.transition(wacid, CallStatus.CONNECTING, { userId: agent1Id })
        await callStateService.transition(wacid, CallStatus.ACTIVE, { answeredAt: new Date() })

        const hungUp: string[] = []
        const notifier = new FakeNotifier()
        const nusawaLog = fakeNusawaLog()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeAsteriskControl({ hangupChannel: async (id) => { hungUp.push(id) } }),
            new RoutingService(), nusawaLog.service, contactService, accountRepository,
        )

        await service.handleHangup("agent1@nusa.id", wacid)

        expect(hungUp).toEqual([wacid])
        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.COMPLETED)
        expect(notifier.packetsFor("agent1@nusa.id").some((p) => p.type === "call_ended")).toBe(true)
        expect(nusawaLog.enqueued).toHaveLength(1)
        expect((nusawaLog.enqueued[0] as { body: string }).body).toContain("dijawab agent1@nusa.id")
    })

    test("handleHangup menutup panggilan keluar SEBELUM diangkat sebagai ABANDONED, bukan COMPLETED", async () => {
        const wacid = "wacid.SIGHANGUPUNANSWERED"
        const outContact = await contactService.findOrCreate("628999888778", null)
        await callStateService.findOrCreate(wacid, {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            contactId: outContact.id,
            userId: agent1Id,
            direction: CallDirection.OUTBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
        })

        const hungUp: string[] = []
        const notifier = new FakeNotifier()
        const nusawaLog = fakeNusawaLog()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeAsteriskControl({ hangupChannel: async (id) => { hungUp.push(id) } }),
            new RoutingService(), nusawaLog.service, contactService, accountRepository,
        )

        await service.handleHangup("agent1@nusa.id", wacid)

        expect(hungUp).toEqual([wacid])
        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.ABANDONED)
        expect(updated!.endReason).toBe(EndReason.AGENT_HANGUP)
        // Panggilan yang tidak pernah tersambung tidak perlu dilaporkan ke log NusaWA
        // (formatnya juga cuma untuk panggilan masuk yang benar-benar dijawab).
        expect(nusawaLog.enqueued).toHaveLength(0)
    })
})

describe("WebhookService — status webhook (informasional dari Meta, kalau masih dikirim untuk nomor SIP)", () => {
    function buatSignaling(notifier: FakeNotifier) {
        const signaling = newSignalingService(notifier)
        return new WebhookService(callStateService, signaling, callRepository, contactService)
    }

    test("pelanggan menolak panggilan keluar", async () => {
        const wacid = "wacid.WHEND_REJECT"
        await callStateService.findOrCreate(wacid, {
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            direction: CallDirection.OUTBOUND, status: CallStatus.PENDING, statusRank: 10,
        })
        await callStateService.transition(wacid, CallStatus.CONNECTING, { userId: agent1Id })
        presenceRegistry.register("agent1@nusa.id", "conn-end-reject")

        const notifier = new FakeNotifier()
        await buatSignaling(notifier).process(JSON.stringify(
            createStatusWebhookPayload({ wacid, status: "REJECTED" })
        ))

        expect(notifier.packetsFor("agent1@nusa.id").some(p => p.type === "call_ended")).toBe(true)
    })
})
