import { Call } from "../call/entities/call.entity"
import { EndReason } from "../call/enums/end-reason.enum"
import { presenceRegistry } from "../user/presence.registry"

export interface RoutingDecision {
    kind: "broadcast" | "reject"
    targets: string[]
    reason?: EndReason
}

export class RoutingService {
    decide(_call: Call): RoutingDecision {
        const targets = presenceRegistry.listAvailable().map((p) => p.email)

        if (targets.length === 0) {
            return { kind: "reject", targets: [], reason: EndReason.NO_AGENT_AVAILABLE }
        }

        return { kind: "broadcast", targets }
    }
}
