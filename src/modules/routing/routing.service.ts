import { Call } from "../call/entities/call.entity"
import { EndReason } from "../call/enum/end-reason.enum"
import { presenceRegistry } from "../user/presence.registry"

export interface RoutingDecision {
    kind: "broadcast" | "reject"
    targets: string[]
    reason?: EndReason
}

/** Chooses which agent(s) to ring for an inbound call: broadcast to every available agent, first answer wins. */
export class RoutingService {
    decide(_call: Call): RoutingDecision {
        const targets = presenceRegistry.listAvailable().map((p) => p.email)

        if (targets.length === 0) {
            return { kind: "reject", targets: [], reason: EndReason.NO_AGENT_AVAILABLE }
        }

        return { kind: "broadcast", targets }
    }
}
