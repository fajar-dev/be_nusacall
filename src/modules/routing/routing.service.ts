import { Call } from "../call/entities/call.entity"
import { EndReason } from "../call/enums/end-reason.enum"
import { presenceRegistry } from "../user/presence.registry"

export interface RoutingDecision {
    kind: "broadcast" | "reject"
    targets: string[]
    reason?: EndReason
}

export class RoutingService {
    /**
     * Panggilan disiarkan ke seluruh agent yang terhubung, termasuk yang sedang
     * menelepon, agar tetap masuk antrean dan dapat diangkat begitu mereka
     * selesai. Penolakan hanya dilakukan bila tidak ada agent yang terhubung.
     */
    decide(_call: Call): RoutingDecision {
        const targets = presenceRegistry.listAll().map((p) => p.email)

        if (targets.length === 0) {
            return { kind: "reject", targets: [], reason: EndReason.NO_AGENT_AVAILABLE }
        }

        return { kind: "broadcast", targets }
    }
}
