import { describe, test, expect, beforeEach } from "bun:test"
import { RoutingService, ContactContext } from "../src/modules/routing/routing.service"
import { presenceRegistry } from "../src/modules/user/presence.registry"
import { EndReason } from "../src/modules/call/enum/end-reason.enum"
import { CallDirection } from "../src/modules/call/enum/call-direction.enum"
import { CallStatus } from "../src/modules/call/enum/call-status.enum"
import type { Call } from "../src/modules/call/entities/call.entity"

/**
 * RoutingService.decide() — `pic_then_queue` (docs/BACKEND-MODULES.md §7):
 * an online PIC gets the call directly, otherwise broadcast to every
 * available agent, first answer wins.
 */

function fakeContext(overrides: Partial<ContactContext> = {}): ContactContext {
    return {
        inboxId: 123,
        contactName: "Budi Santoso",
        lastMessage: null,
        tags: [],
        picUsername: null,
        nusawaThreadUrl: null,
        ...overrides,
    }
}

function fakeCall(overrides: Partial<Call> = {}): Call {
    return {
        id: 1,
        wacid: "wacid.ROUTE1",
        phoneNumberId: "202063559668129",
        waId: "628123456789",
        direction: CallDirection.INBOUND,
        status: CallStatus.PENDING,
        statusRank: 10,
        recordingEnabled: false,
        transcriptionEnabled: false,
        nusawaLogged: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as Call
}

describe("RoutingService", () => {
    beforeEach(() => {
        // Drain any leftover presence from other tests sharing the singleton.
        for (const p of presenceRegistry.listAll()) {
            for (const connectionId of p.connectionIds) presenceRegistry.unregister(connectionId)
        }
    })

    test("rejects with NO_AGENT_AVAILABLE when nobody is online", () => {
        const decision = new RoutingService().decide(fakeCall())
        expect(decision.kind).toBe("reject")
        expect(decision.reason).toBe(EndReason.NO_AGENT_AVAILABLE)
        expect(decision.targets).toEqual([])
    })

    test("broadcasts to every available agent", () => {
        presenceRegistry.register("agent1@nusa.id", "conn-1")
        presenceRegistry.register("agent2@nusa.id", "conn-2")

        const decision = new RoutingService().decide(fakeCall())

        expect(decision.kind).toBe("broadcast")
        expect(decision.targets.sort()).toEqual(["agent1@nusa.id", "agent2@nusa.id"])
    })

    test("excludes an agent who is busy on another call", () => {
        presenceRegistry.register("agent1@nusa.id", "conn-1")
        presenceRegistry.register("agent2@nusa.id", "conn-2")
        presenceRegistry.setCurrentCall("agent1@nusa.id", 999)

        const decision = new RoutingService().decide(fakeCall())

        expect(decision.targets).toEqual(["agent2@nusa.id"])
    })

    test("routes directly to an online PIC instead of broadcasting", () => {
        presenceRegistry.register("pic@nusa.id", "conn-1")
        presenceRegistry.register("other@nusa.id", "conn-2")

        const decision = new RoutingService().decide(fakeCall(), fakeContext({ picUsername: "pic@nusa.id" }))

        expect(decision.kind).toBe("direct")
        expect(decision.targets).toEqual(["pic@nusa.id"])
    })

    test("falls back to broadcast when the PIC is offline", () => {
        presenceRegistry.register("other@nusa.id", "conn-2")

        const decision = new RoutingService().decide(fakeCall(), fakeContext({ picUsername: "pic@nusa.id" }))

        expect(decision.kind).toBe("broadcast")
        expect(decision.targets).toEqual(["other@nusa.id"])
    })

    test("broadcasts when there's no ticket context at all", () => {
        presenceRegistry.register("agent1@nusa.id", "conn-1")

        const decision = new RoutingService().decide(fakeCall(), null)

        expect(decision.kind).toBe("broadcast")
    })
})
