import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { RTCPeerConnection, RTCRtpCodecParameters } from "werift"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase } from "./setup"
import { createTerminateWebhookPayload } from "./helpers"
import { TypeOrmCallRepository } from "../src/modules/call/repositories/call.repository"
import { TypeOrmCallEventRepository } from "../src/modules/call/repositories/call-event.repository"
import { CallStateService } from "../src/modules/call/call-state.service"
import { CallSignalingService } from "../src/modules/call/call-signaling.service"
import { WebhookService } from "../src/modules/webhook/webhook.service"
import { CallRecordingService } from "../src/modules/call/call-recording.service"
import { TypeOrmCallRecordingRepository } from "../src/modules/call/repositories/call-recording.repository"
import { RoutingService } from "../src/modules/routing/routing.service"
import { CallStatus } from "../src/modules/call/enum/call-status.enum"
import { CallDirection } from "../src/modules/call/enum/call-direction.enum"
import { sessionRegistry } from "../src/infrastructure/media/session-registry"
import { presenceRegistry } from "../src/modules/agent/presence.registry"
import type { ICallMediaCoordinator } from "../src/modules/call/interfaces/call-media-coordinator.interface"
import type { MetaClient } from "../src/infrastructure/meta/meta.client"
import type { NusawaClient } from "../src/infrastructure/nusawa/nusawa.client"
import type { NusawaLogService } from "../src/modules/call/nusawa-log.service"
import type { IAgentNotifier, WsOutboundPacket } from "../src/modules/call/interfaces/call-signaling.interface"

/**
 * Exercises CallSignalingService against a real DB (state transitions) and a
 * real werift MediaSession (WebRTC negotiation, same pattern as
 * test/media-session.test.ts), with MetaClient and the WS transport
 * (IAgentNotifier) mocked — this is the orchestration layer, not the Graph
 * API client or the WebSocket transport itself.
 */

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
    sent: { username: string; packet: WsOutboundPacket }[] = []

    send(username: string, packet: WsOutboundPacket): void {
        this.sent.push({ username, packet })
    }

    sendToAgents(usernames: string[], packet: WsOutboundPacket): void {
        for (const username of usernames) this.send(username, packet)
    }

    packetsFor(username: string): WsOutboundPacket[] {
        return this.sent.filter((s) => s.username === username).map((s) => s.packet)
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

/** No ticket found for any caller — matches "nusawa unreachable/no context" degradation, same as pre-1.5 behavior. */
function fakeNusawaClient(): NusawaClient {
    return {
        findInboxByContact: async () => null,
        getInboxDetail: async () => null,
    } as unknown as NusawaClient
}

function fakeNusawaClientWithInbox(opts: { picUsername?: string; contactName?: string; lastMessage?: string }): NusawaClient {
    const inbox = {
        id: 555,
        username: opts.picUsername ? { String: opts.picUsername, Valid: true } : { String: "", Valid: false },
        contact: { phone_number: "628123456789", name: opts.contactName ?? null, branch_code: null },
        last_sent_message: opts.lastMessage ? { String: opts.lastMessage, Valid: true } : null,
        tags: ["helpdesk"],
        resolved: 0,
    }
    return {
        findInboxByContact: async () => inbox,
        getInboxDetail: async () => inbox,
    } as unknown as NusawaClient
}

function fakeNusawaLog(): { enqueued: unknown[]; service: NusawaLogService } {
    const enqueued: unknown[] = []
    const service = { enqueue: async (input: unknown) => { enqueued.push(input) } } as unknown as NusawaLogService
    return { enqueued, service }
}

let callRepository: TypeOrmCallRepository
let callStateService: CallStateService

beforeAll(async () => {
    await initTestDatabase()
    callRepository = new TypeOrmCallRepository()
    callStateService = new CallStateService(callRepository, new TypeOrmCallEventRepository())
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
    for (const p of presenceRegistry.listAll()) {
        for (const connectionId of p.connectionIds) presenceRegistry.unregister(connectionId)
    }
})

async function createRingingCall(wacid: string) {
    const call = await callStateService.findOrCreate(wacid, {
        phoneNumberId: "202063559668129",
        waId: "628123456789",
        direction: CallDirection.INBOUND,
        status: CallStatus.PENDING,
        statusRank: 10,
    })

    // Simulate establishEarly() having already run (Meta leg ready for pre_accept).
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
            phoneNumberId: "202063559668129", waId: "628123456789",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        const service = new CallSignalingService(notifier, callRepository, callStateService, fakeMetaClient(), new RoutingService(), fakeNusawaClient(), fakeNusawaLog().service)
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
            phoneNumberId: "202063559668129", waId: "628123456789",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        // Regression: pre_accept already went out by the time notifyIncoming
        // runs (WebhookService.handleConnect calls establishEarly() first) —
        // Meta is left waiting for accept/reject next. Only tearing down our
        // own session and never calling Meta's reject left the caller
        // hanging until Meta's own timeout, surfacing as a confusing "no
        // media received from the business" error instead of a clean decline.
        const rejectedIds: string[] = []
        const notifier = new FakeNotifier()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeMetaClient({ reject: async (_pn, id) => { rejectedIds.push(id); return { success: true } } }),
            new RoutingService(), fakeNusawaClient(), fakeNusawaLog().service,
        )
        await service.notifyIncoming(call)

        expect(rejectedIds).toEqual(["wacid.SIGMISSED1"])
        const updated = await callRepository.findByWacid("wacid.SIGMISSED1")
        expect(updated!.status).toBe(CallStatus.MISSED)
    })

    test("still marks the call MISSED even if Meta's reject call itself fails", async () => {
        const call = await callStateService.findOrCreate("wacid.SIGMISSED2", {
            phoneNumberId: "202063559668129", waId: "628123456789",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeMetaClient({ reject: async () => { throw new Error("Meta is down") } }),
            new RoutingService(), fakeNusawaClient(), fakeNusawaLog().service,
        )
        await service.notifyIncoming(call)

        const updated = await callRepository.findByWacid("wacid.SIGMISSED2")
        expect(updated!.status).toBe(CallStatus.MISSED)
    })

    test("includes nusawa contact context in the incoming_call packet and rings the PIC directly", async () => {
        presenceRegistry.register("pic@nusa.id", "conn-1")
        presenceRegistry.register("other@nusa.id", "conn-2")
        const call = await callStateService.findOrCreate("wacid.SIGCTX1", {
            phoneNumberId: "202063559668129", waId: "628123456789",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        const nusawaClient = fakeNusawaClientWithInbox({ picUsername: "pic@nusa.id", contactName: "Budi Santoso", lastMessage: "Internet saya mati" })
        const service = new CallSignalingService(notifier, callRepository, callStateService, fakeMetaClient(), new RoutingService(), nusawaClient, fakeNusawaLog().service)
        await service.notifyIncoming(call)

        expect(notifier.packetsFor("other@nusa.id")).toHaveLength(0) // not rung — call went straight to the PIC
        const incoming = notifier.packetsFor("pic@nusa.id")[0]
        const data = incoming?.data as Record<string, unknown>
        expect(data.contactName).toBe("Budi Santoso")
        expect(data.lastMessage).toBe("Internet saya mati")
        expect(data.isPicMatch).toBe(true)
    })

    test("still rings agents when nusawa's contact lookup throws (degradation, docs/ROADMAP.md M1.5)", async () => {
        presenceRegistry.register("agent1@nusa.id", "conn-1")
        const call = await callStateService.findOrCreate("wacid.SIGDEGRADE1", {
            phoneNumberId: "202063559668129", waId: "628123456789",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })

        const notifier = new FakeNotifier()
        const brokenNusawa = {
            findInboxByContact: async () => { throw new Error("nusawa is down") },
            getInboxDetail: async () => { throw new Error("nusawa is down") },
        } as unknown as NusawaClient
        const service = new CallSignalingService(notifier, callRepository, callStateService, fakeMetaClient(), new RoutingService(), brokenNusawa, fakeNusawaLog().service)

        await service.notifyIncoming(call)

        const updated = await callRepository.findByWacid("wacid.SIGDEGRADE1")
        expect(updated!.status).toBe(CallStatus.RINGING)
        expect(notifier.packetsFor("agent1@nusa.id")[0]?.type).toBe("incoming_call")
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
            new RoutingService(), fakeNusawaClient(), fakeNusawaLog().service,
        )

        const offerSdp = await fakeBrowserOfferSdp()
        await service.handleAnswer("agent1@nusa.id", wacid, offerSdp)

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.ACTIVE)
        expect(updated!.agentUsername).toBe("agent1@nusa.id")
        expect(acceptedWith[1]).toBe(wacid)

        const packets = notifier.packetsFor("agent1@nusa.id").map((p) => p.type)
        expect(packets).toContain("webrtc_answer")
        expect(packets).toContain("call_state")
    })

    test("second agent to answer gets call_taken instead of stealing the call", async () => {
        const wacid = "wacid.SIGANSWER2"
        await createRingingCall(wacid)
        presenceRegistry.register("agent2@nusa.id", "conn-2")
        presenceRegistry.setCurrentCall("agent2@nusa.id", (await callRepository.findByWacid(wacid))!.id)

        const notifier = new FakeNotifier()
        const service = new CallSignalingService(notifier, callRepository, callStateService, fakeMetaClient(), new RoutingService(), fakeNusawaClient(), fakeNusawaLog().service)

        const offer1 = await fakeBrowserOfferSdp()
        const offer2 = await fakeBrowserOfferSdp()
        await service.handleAnswer("agent1@nusa.id", wacid, offer1)
        await service.handleAnswer("agent2@nusa.id", wacid, offer2)

        const agent2Packets = notifier.packetsFor("agent2@nusa.id")
        expect(agent2Packets.some((p) => p.type === "call_taken")).toBe(true)

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.agentUsername).toBe("agent1@nusa.id")
    })

    test("notifies other ringing agents that the call was taken once one agent answers", async () => {
        const wacid = "wacid.SIGANSWER3"
        await createRingingCall(wacid)
        const call = (await callRepository.findByWacid(wacid))!
        presenceRegistry.register("agent2@nusa.id", "conn-2")
        presenceRegistry.setCurrentCall("agent2@nusa.id", call.id)

        const notifier = new FakeNotifier()
        const service = new CallSignalingService(notifier, callRepository, callStateService, fakeMetaClient(), new RoutingService(), fakeNusawaClient(), fakeNusawaLog().service)

        const offerSdp = await fakeBrowserOfferSdp()
        await service.handleAnswer("agent1@nusa.id", wacid, offerSdp)

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
            new RoutingService(), fakeNusawaClient(), fakeNusawaLog().service,
        )

        const offerSdp = await fakeBrowserOfferSdp()
        await service.handleAnswer("agent1@nusa.id", wacid, offerSdp)

        const updated = await callRepository.findByWacid(wacid)
        expect(updated!.status).toBe(CallStatus.FAILED)
        expect(notifier.packetsFor("agent1@nusa.id").some((p) => p.type === "call_ended")).toBe(true)
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
            new RoutingService(), fakeNusawaClient(), nusawaLog.service,
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
        await callStateService.transition(wacid, CallStatus.CONNECTING, { agentUsername: "agent1@nusa.id" })
        await callStateService.transition(wacid, CallStatus.ACTIVE, { answeredAt: new Date() })

        const terminatedIds: string[] = []
        const notifier = new FakeNotifier()
        const nusawaLog = fakeNusawaLog()
        const service = new CallSignalingService(
            notifier, callRepository, callStateService,
            fakeMetaClient({ terminate: async (_pn, id) => { terminatedIds.push(id); return { success: true } } }),
            new RoutingService(), fakeNusawaClient(), nusawaLog.service,
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
}

describe("WebhookService + CallSignalingService — terminate logging", () => {
    test("a customer-initiated terminate after ANSWERED logs a completed message and tells the agent it's over", async () => {
        const wacid = "wacid.WHSIGLOG1"
        const call = await callStateService.findOrCreate(wacid, {
            phoneNumberId: "202063559668129", waId: "628123456789",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })
        await callStateService.transition(wacid, CallStatus.CONNECTING, { agentUsername: "agent1@nusa.id" })
        await callStateService.transition(wacid, CallStatus.ACTIVE, { answeredAt: new Date() })
        presenceRegistry.register("agent1@nusa.id", "conn-whsiglog1")
        presenceRegistry.setCurrentCall("agent1@nusa.id", call.id)

        const nusawaLog = fakeNusawaLog()
        const notifier = new FakeNotifier()
        const signaling = new CallSignalingService(
            notifier, callRepository, callStateService, fakeMetaClient(),
            new RoutingService(), fakeNusawaClient(), nusawaLog.service,
        )
        const webhook = new WebhookService(
            callStateService, noopMedia, signaling, callRepository,
            new CallRecordingService(new TypeOrmCallRecordingRepository(), fakeMetaClient(), { upload: async () => "", getPresignedUrl: async () => "", download: async () => Buffer.from("") }),
        )

        const payload = createTerminateWebhookPayload({ wacid, status: "COMPLETED", duration: 42 })
        await webhook.process(JSON.stringify(payload))

        expect(nusawaLog.enqueued).toHaveLength(1)
        const body = (nusawaLog.enqueued[0] as { body: string }).body
        expect(body).toContain("dijawab agent1@nusa.id")
        expect(body).toContain("42d")

        // The bug this test guards: without notifyCallEnded, a customer
        // hanging up first left the agent's UI stuck on an active call
        // forever, and their presence never freed up for the next one.
        expect(notifier.packetsFor("agent1@nusa.id").some((p) => p.type === "call_ended")).toBe(true)
        expect(presenceRegistry.get("agent1@nusa.id")?.currentCallId).toBeNull()
    })

    test("does not double-log when a terminate webhook arrives after the agent already hung up", async () => {
        const wacid = "wacid.WHSIGLOG2"
        await callStateService.findOrCreate(wacid, {
            phoneNumberId: "202063559668129", waId: "628123456789",
            direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
        })
        await callStateService.transition(wacid, CallStatus.CONNECTING, { agentUsername: "agent1@nusa.id" })
        await callStateService.transition(wacid, CallStatus.ACTIVE, { answeredAt: new Date() })

        const nusawaLog = fakeNusawaLog()
        const signaling = new CallSignalingService(
            new FakeNotifier(), callRepository, callStateService, fakeMetaClient(),
            new RoutingService(), fakeNusawaClient(), nusawaLog.service,
        )
        const webhook = new WebhookService(
            callStateService, noopMedia, signaling, callRepository,
            new CallRecordingService(new TypeOrmCallRecordingRepository(), fakeMetaClient(), { upload: async () => "", getPresignedUrl: async () => "", download: async () => Buffer.from("") }),
        )

        // Agent hangs up first (already logs once)...
        await signaling.handleHangup("agent1@nusa.id", wacid)
        expect(nusawaLog.enqueued).toHaveLength(1)

        // ...then Meta's own terminate webhook for the same call arrives.
        const payload = createTerminateWebhookPayload({ wacid, status: "COMPLETED", duration: 42 })
        await webhook.process(JSON.stringify(payload))

        expect(nusawaLog.enqueued).toHaveLength(1) // still 1 — the rank guard blocked the second transition
    })
})
