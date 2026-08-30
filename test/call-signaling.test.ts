import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { RTCPeerConnection, RTCRtpCodecParameters } from "werift"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createUserAndToken } from "./setup"
import { createTerminateWebhookPayload, createStatusWebhookPayload } from "./helpers"
import { TypeOrmCallRepository } from "../src/modules/call/repositories/call.repository"
import { TypeOrmCallEventRepository } from "../src/modules/call/repositories/call-event.repository"
import { CallStateService } from "../src/modules/call/call-state.service"
import { CallSignalingService } from "../src/modules/call/call-signaling.service"
import { CallMediaCoordinator } from "../src/modules/call/call-media.coordinator"
import { WebhookService } from "../src/modules/webhook/webhook.service"
import { CallRecordingService } from "../src/modules/call/call-recording.service"
import { TypeOrmCallRecordingRepository } from "../src/modules/call/repositories/call-recording.repository"
import { ContactService } from "../src/modules/contact/contact.service"
import { TypeOrmContactRepository } from "../src/modules/contact/repositories/contact.repository"
import { RoutingService } from "../src/modules/routing/routing.service"
import { CallStatus } from "../src/modules/call/enums/call-status.enum"
import { CallDirection } from "../src/modules/call/enums/call-direction.enum"
import { sessionRegistry } from "../src/infrastructure/media/session-registry"
import { presenceRegistry } from "../src/modules/user/presence.registry"
import { config } from "../src/config/config"
import type { ICallMediaCoordinator } from "../src/modules/call/interfaces/call-media-coordinator.interface"
import type { MetaClient } from "../src/infrastructure/meta/meta.client"
import type { NusawaLogService } from "../src/modules/call/nusawa-log.service"
import type { IAgentNotifier, WsOutboundPacket } from "../src/modules/call/interfaces/call-signaling.interface"

function opusCodec() {
    return new RTCRtpCodecParameters({ mimeType: "audio/opus", clockRate: 48000, channels: 2, payloadType: 111 })
}

async function waitIceComplete(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === "complete") return
    await new Promise<void>((resolve) => {
        const check = () => { if (pc.iceGatheringState === "complete") resolve() }
        pc.iceGatheringStateChange.subscribe(check)
        setTimeout(resolve, 5000)
    })
}

async function fakeBrowserOfferSdp(): Promise<string> {
    const pc = new RTCPeerConnection({ codecs: { audio: [opusCodec()] } })
    pc.addTransceiver("audio", { direction: "sendrecv" })
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitIceComplete(pc)
    return pc.localDescription!.sdp
}

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

function fakeMetaClient(overrides: Partial<MetaClient> = {}): MetaClient {
    return {
        accept: async () => ({ success: true }),
        reject: async () => ({ success: true }),
        terminate: async () => ({ success: true }),
        ...overrides,
    } as unknown as MetaClient
}

function fakeNusawaLog(): { enqueued: unknown[]; service: NusawaLogService } {
    const enqueued: unknown[] = []
    const service = { enqueue: async (input: unknown) => { enqueued.push(input) } } as unknown as NusawaLogService
    return { enqueued, service }
}

let callRepository: TypeOrmCallRepository
let callStateService: CallStateService
let contactService: ContactService
let agent1Id: number
let agent2Id: number

beforeAll(async () => {
    await initTestDatabase()
    callRepository = new TypeOrmCallRepository()
    callStateService = new CallStateService(callRepository, new TypeOrmCallEventRepository())
    contactService = new ContactService(new TypeOrmContactRepository())
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
})

async function createRingingCall(wacid: string) {
    const call = await callStateService.findOrCreate(wacid, {
        phoneNumberId: "202063559668129",
        direction: CallDirection.INBOUND,
        status: CallStatus.PENDING,
        statusRank: 10,
    })

    const session = sessionRegistry.create(wacid)
    const metaPc = new RTCPeerConnection({ codecs: { audio: [opusCodec()] } })
    metaPc.addTransceiver("audio", { direction: "sendrecv" })
    const metaOffer = await metaPc.createOffer()
    await metaPc.setLocalDescription(metaOffer)
    await waitIceComplete(metaPc)
    await session.acceptMetaOffer(metaPc.localDescription!.sdp)

    await callStateService.transition(wacid, CallStatus.RINGING, { ringingAt: new Date() })
    presenceRegistry.register("agent1@nusa.id", "conn-1")
    presenceRegistry.setCurrentCall("agent1@nusa.id", call.id)

    return call
}

describe("CallSignalingService.notifyIncoming", () => {
    test("rings every available agent and transitions the call to RINGING", async () => {
        presenceRegistry.register("agent1@nusa.id", "conn-1")
        const call = await callStateService.findOrCreate("wacid.SIGRING1", {
            phoneNumberId: "202063559668129",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        const service = new CallSignalingService(notifier, callRepository, callStateService, fakeMetaClient(), new RoutingService(), fakeNusawaLog().service, contactService)
        await service.notifyIncoming(call)

        const updated = await callRepository.findByWacid("wacid.SIGRING1")
        expect(updated!.status).toBe(CallStatus.RINGING)
        const incoming = notifier.packetsFor("agent1@nusa.id")[0]
        expect(incoming?.type).toBe("incoming_call")
        const expiresAt = (incoming?.data as { expiresAt: number }).expiresAt
        expect(expiresAt).toBeGreaterThan(Date.now())
    })

    test("marks the call MISSED when no agent is available, and tells Meta reject (not just local cleanup)", async () => {
        const call = await callStateService.findOrCreate("wacid.SIGMISSED1", {
            phoneNumberId: "202063559668129",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const rejectedIds: string[] = []
        const notifier = new FakeNotifier()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeMetaClient({ reject: async (_pn, id) => { rejectedIds.push(id); return { success: true } } }),
            new RoutingService(), fakeNusawaLog().service, contactService,
        )
        await service.notifyIncoming(call)

        expect(rejectedIds).toEqual(["wacid.SIGMISSED1"])
        const updated = await callRepository.findByWacid("wacid.SIGMISSED1")
        expect(updated!.status).toBe(CallStatus.MISSED)
    })

    test("still marks the call MISSED even if Meta's reject call itself fails", async () => {
        const call = await callStateService.findOrCreate("wacid.SIGMISSED2", {
            phoneNumberId: "202063559668129",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeMetaClient({ reject: async () => { throw new Error("Meta is down") } }),
            new RoutingService(), fakeNusawaLog().service, contactService,
        )
        await service.notifyIncoming(call)

        const updated = await callRepository.findByWacid("wacid.SIGMISSED2")
        expect(updated!.status).toBe(CallStatus.MISSED)
    })

})

describe("CallSignalingService.handleAnswer", () => {
    test("wires the agent's SDP, calls Meta accept, and activates the call", async () => {
        const wacid = "wacid.SIGANSWER1"
        await createRingingCall(wacid)

        let acceptedWith: string[] = []
        const notifier = new FakeNotifier()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeMetaClient({ accept: async (pn, id, sdp) => { acceptedWith = [pn, id, sdp]; return { success: true } } }),
            new RoutingService(), fakeNusawaLog().service, contactService,
        )

        const offerSdp = await fakeBrowserOfferSdp()
        await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid, offerSdp)

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.ACTIVE)
        expect(updated!.userId).toBe(agent1Id)
        expect(acceptedWith[1]).toBe(wacid)

        const packets = notifier.packetsFor("agent1@nusa.id").map((p) => p.type)
        expect(packets).toContain("webrtc_answer")
        expect(packets).toContain("call_state")
    })

    test("stamps the Call row with recordingEnabled as actually requested on accept", async () => {
        const original = { recording: config.recording.recordingEnabled }
        config.recording.recordingEnabled = true
        try {
            const wacid = "wacid.SIGANSWERRECORD1"
            await createRingingCall(wacid)
            const service = new CallSignalingService(
                new FakeNotifier(), callRepository, callStateService, fakeMetaClient(),
                new RoutingService(), fakeNusawaLog().service, contactService,
            )

            await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid, await fakeBrowserOfferSdp())

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
        const service = new CallSignalingService(notifier, callRepository, callStateService, fakeMetaClient(), new RoutingService(), fakeNusawaLog().service, contactService)

        const offer1 = await fakeBrowserOfferSdp()
        const offer2 = await fakeBrowserOfferSdp()
        await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid, offer1)
        await service.handleAnswer(agent2Id, "agent2@nusa.id", wacid, offer2)

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
        const service = new CallSignalingService(notifier, callRepository, callStateService, fakeMetaClient(), new RoutingService(), fakeNusawaLog().service, contactService)

        const offerSdp = await fakeBrowserOfferSdp()
        await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid, offerSdp)

        const agent2Packets = notifier.packetsFor("agent2@nusa.id")
        expect(agent2Packets.some((p) => p.type === "call_taken")).toBe(true)
        expect(presenceRegistry.get("agent2@nusa.id")?.currentCallId).toBeNull()
    })

    test("transitions to FAILED when Meta's accept call throws", async () => {
        const wacid = "wacid.SIGANSWERFAIL1"
        await createRingingCall(wacid)

        const notifier = new FakeNotifier()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeMetaClient({ accept: async () => { throw new Error("Meta rejected the SDP") } }),
            new RoutingService(), fakeNusawaLog().service, contactService,
        )

        const offerSdp = await fakeBrowserOfferSdp()
        await service.handleAnswer(agent1Id, "agent1@nusa.id", wacid, offerSdp)

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.FAILED)
        expect(notifier.packetsFor("agent1@nusa.id").some((p) => p.type === "call_ended")).toBe(true)
    })
})

async function fakeMetaAnswerSdp(offerSdp: string): Promise<string> {
    const metaPc = new RTCPeerConnection({ codecs: { audio: [opusCodec()] } })
    metaPc.addTransceiver("audio", { direction: "sendrecv" })
    await metaPc.setRemoteDescription({ type: "offer", sdp: offerSdp })
    const answer = await metaPc.createAnswer()
    await metaPc.setLocalDescription(answer)
    await waitIceComplete(metaPc)
    return metaPc.localDescription!.sdp
}

describe("CallSignalingService.initiateOutbound", () => {
    test("creates the Call row, claims presence, and returns the wacid Meta assigned", async () => {
        presenceRegistry.register("agent1@nusa.id", "conn-out1")
        const service = new CallSignalingService(
            new FakeNotifier(), callRepository, callStateService,
            fakeMetaClient({ connect: async () => ({ success: true, calls: [{ id: "wacid.OUT1" }] }) }),
            new RoutingService(), fakeNusawaLog().service, contactService,
        )

        const offerSdp = await fakeBrowserOfferSdp()
        const outContact = await contactService.findOrCreate("628999888777", null)
        const result = await service.initiateOutbound(agent1Id, "agent1@nusa.id", "202063559668129", outContact.id, offerSdp)

        expect(result.wacid).toBe("wacid.OUT1")
        expect(result.answerSdp).toContain("v=0")

        const call = await callRepository.findByWacid("wacid.OUT1")
        expect(call).not.toBeNull()
        expect(call!.direction).toBe(CallDirection.OUTBOUND)
        expect(call!.userId).toBe(agent1Id)
        expect(presenceRegistry.get("agent1@nusa.id")?.currentCallId).toBe(call!.id)
    })

    test("cleans up the media session and creates no Call row when Meta's connect call fails", async () => {
        const service = new CallSignalingService(
            new FakeNotifier(), callRepository, callStateService,
            fakeMetaClient({ connect: async () => { throw new Error("138006: No approved call permission found") } }),
            new RoutingService(), fakeNusawaLog().service, contactService,
        )

        const offerSdp = await fakeBrowserOfferSdp()
        const failContact = await contactService.findOrCreate("628999888777", null)
        await expect(service.initiateOutbound(agent1Id, "agent1@nusa.id", "202063559668129", failContact.id, offerSdp)).rejects.toThrow()

        const call = await callRepository.findByWacid("628999888777")
        expect(call).toBeNull()
    })

    test("end to end through the webhook layer: BIC connect answer + status ACCEPTED activates the call and notifies the agent", async () => {
        presenceRegistry.register("agent1@nusa.id", "conn-out2")
        const notifier = new FakeNotifier()
        const signaling = new CallSignalingService(
            notifier, callRepository, callStateService, fakeMetaClient({ connect: async () => ({ success: true, calls: [{ id: "wacid.OUT2" }] }) }),
            new RoutingService(), fakeNusawaLog().service, contactService,
        )
        const media = new CallMediaCoordinator(fakeMetaClient())
        const webhook = new WebhookService(
            callStateService, media, signaling, callRepository,
            new CallRecordingService(new TypeOrmCallRecordingRepository(), { upload: async () => "", getPresignedUrl: async () => "" }),
            contactService,
        )

        const agentOfferSdp = await fakeBrowserOfferSdp()
        const outContact = await contactService.findOrCreate("628999888777", null)
        const { wacid } = await signaling.initiateOutbound(agent1Id, "agent1@nusa.id", "202063559668129", outContact.id, agentOfferSdp)

        const ourOutboundOfferSdp = sessionRegistry.get(wacid)!.metaOfferSdp!
        const metaAnswerSdp = await fakeMetaAnswerSdp(ourOutboundOfferSdp)

        const connectPayload: Record<string, unknown> = {
            object: "whatsapp_business_account",
            entry: [{
                id: "252757097922101",
                changes: [{
                    field: "calls",
                    value: {
                        messaging_product: "whatsapp",
                        metadata: { display_phone_number: "62819854321", phone_number_id: "202063559668129" },
                        calls: [{
                            id: wacid, to: "628999888777", from: "62819854321", event: "connect",
                            direction: "BUSINESS_INITIATED", timestamp: String(Math.floor(Date.now() / 1000)),
                            session: { sdp_type: "answer", sdp: metaAnswerSdp },
                        }],
                    },
                }],
            }],
        }
        await webhook.process(JSON.stringify(connectPayload))
        await webhook.process(JSON.stringify(createStatusWebhookPayload({ wacid, status: "ACCEPTED" })))

        const call = await callRepository.findByWacid(wacid)
        expect(call!.status).toBe(CallStatus.ACTIVE)
        expect(notifier.packetsFor("agent1@nusa.id").some((p) => p.type === "call_state" && (p.data as { status: string })?.status === "active")).toBe(true)
    })
})

describe("CallSignalingService.handleReject / handleHangup", () => {
    test("handleReject calls Meta reject and marks the call REJECTED", async () => {
        const wacid = "wacid.SIGREJECT1"
        await createRingingCall(wacid)

        const rejectedIds: string[] = []
        const notifier = new FakeNotifier()
        const nusawaLog = fakeNusawaLog()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeMetaClient({ reject: async (_pn, id) => { rejectedIds.push(id); return { success: true } } }),
            new RoutingService(), nusawaLog.service, contactService,
        )

        await service.handleReject("agent1@nusa.id", wacid, "busy")

        expect(rejectedIds).toEqual([wacid])
        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.REJECTED)
        expect(nusawaLog.enqueued).toHaveLength(1)
        expect((nusawaLog.enqueued[0] as { body: string }).body).toContain("ditolak")
    })

    test("handleHangup calls Meta terminate and marks the call COMPLETED", async () => {
        const wacid = "wacid.SIGHANGUP1"
        await createRingingCall(wacid)
        await callStateService.transition(wacid, CallStatus.CONNECTING, { userId: agent1Id })
        await callStateService.transition(wacid, CallStatus.ACTIVE, { answeredAt: new Date() })

        const terminatedIds: string[] = []
        const notifier = new FakeNotifier()
        const nusawaLog = fakeNusawaLog()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeMetaClient({ terminate: async (_pn, id) => { terminatedIds.push(id); return { success: true } } }),
            new RoutingService(), nusawaLog.service, contactService,
        )

        await service.handleHangup("agent1@nusa.id", wacid)

        expect(terminatedIds).toEqual([wacid])
        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.COMPLETED)
        expect(notifier.packetsFor("agent1@nusa.id").some((p) => p.type === "call_ended")).toBe(true)
        expect(nusawaLog.enqueued).toHaveLength(1)
        expect((nusawaLog.enqueued[0] as { body: string }).body).toContain("dijawab agent1@nusa.id")
    })
})

const noopMedia: ICallMediaCoordinator = {
    establishEarly: async () => ({ ok: true }),
    teardown: async () => {},
    applyOutboundAnswer: async () => ({ ok: true }),
    startOutboundForwarding: async () => {},
}

describe("WebhookService + CallSignalingService — terminate logging", () => {
    test("a customer-initiated terminate after ANSWERED logs a completed message and tells the agent it's over", async () => {
        const wacid = "wacid.WHSIGLOG1"
        const call = await callStateService.findOrCreate(wacid, {
            phoneNumberId: "202063559668129",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })
        await callStateService.transition(wacid, CallStatus.CONNECTING, { userId: agent1Id })
        await callStateService.transition(wacid, CallStatus.ACTIVE, { answeredAt: new Date() })
        presenceRegistry.register("agent1@nusa.id", "conn-whsiglog1")
        presenceRegistry.setCurrentCall("agent1@nusa.id", call.id)

        const nusawaLog = fakeNusawaLog()
        const notifier = new FakeNotifier()
        const signaling = new CallSignalingService(
            notifier, callRepository, callStateService, fakeMetaClient(),
            new RoutingService(), nusawaLog.service, contactService,
        )
        const webhook = new WebhookService(
            callStateService, noopMedia, signaling, callRepository,
            new CallRecordingService(new TypeOrmCallRecordingRepository(), { upload: async () => "", getPresignedUrl: async () => "" }),
            contactService,
        )

        const payload = createTerminateWebhookPayload({ wacid, status: "COMPLETED", duration: 42 })
        await webhook.process(JSON.stringify(payload))

        expect(nusawaLog.enqueued).toHaveLength(1)
        const body = (nusawaLog.enqueued[0] as { body: string }).body
        expect(body).toContain("dijawab agent1@nusa.id")
        expect(body).toContain("42d")

        expect(notifier.packetsFor("agent1@nusa.id").some((p) => p.type === "call_ended")).toBe(true)
        expect(presenceRegistry.get("agent1@nusa.id")?.currentCallId).toBeNull()
    })

    test("does not double-log when a terminate webhook arrives after the agent already hung up", async () => {
        const wacid = "wacid.WHSIGLOG2"
        await callStateService.findOrCreate(wacid, {
            phoneNumberId: "202063559668129",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })
        await callStateService.transition(wacid, CallStatus.CONNECTING, { userId: agent1Id })
        await callStateService.transition(wacid, CallStatus.ACTIVE, { answeredAt: new Date() })

        const nusawaLog = fakeNusawaLog()
        const signaling = new CallSignalingService(
            new FakeNotifier(), callRepository, callStateService, fakeMetaClient(),
            new RoutingService(), nusawaLog.service, contactService,
        )
        const webhook = new WebhookService(
            callStateService, noopMedia, signaling, callRepository,
            new CallRecordingService(new TypeOrmCallRecordingRepository(), { upload: async () => "", getPresignedUrl: async () => "" }),
            contactService,
        )

        await signaling.handleHangup("agent1@nusa.id", wacid)
        expect(nusawaLog.enqueued).toHaveLength(1)

        const payload = createTerminateWebhookPayload({ wacid, status: "COMPLETED", duration: 42 })
        await webhook.process(JSON.stringify(payload))

        expect(nusawaLog.enqueued).toHaveLength(1) // still 1 — the rank guard blocked the second transition
    })
})
