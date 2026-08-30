import { describe, test, expect, beforeEach } from "bun:test"
import { RoutingService } from "../src/modules/routing/routing.service"
import { presenceRegistry } from "../src/modules/user/presence.registry"
import { EndReason } from "../src/modules/call/enums/end-reason.enum"
import { CallDirection } from "../src/modules/call/enums/call-direction.enum"
import { CallStatus } from "../src/modules/call/enums/call-status.enum"
import type { Call } from "../src/modules/call/entities/call.entity"

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
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as Call
}

describe("RoutingService", () => {
    beforeEach(() => {
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
})
