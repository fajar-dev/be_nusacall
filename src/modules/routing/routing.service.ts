import { Call } from "../call/entities/call.entity"
import { EndReason } from "../call/enum/end-reason.enum"
import { presenceRegistry } from "../user/presence.registry"

export interface RoutingDecision {
    kind: "direct" | "broadcast" | "reject"
    targets: string[]
    reason?: EndReason
}

/** Ticket context looked up from nusawa right before routing — docs/INTEGRATION-NUSAWA.md §3.3-3.4. */
export interface ContactContext {
    inboxId: number | null
    contactName: string | null
    lastMessage: string | null
    tags: string[]
    picUsername: string | null
    nusawaThreadUrl: string | null
}

/**
 * Chooses which agent(s) to ring for an inbound call — `pic_then_queue`
 * (docs/BACKEND-MODULES.md §7): a PIC who's online gets it directly,
 * otherwise broadcast to every available agent, first answer wins.
 * Whitelist/call-hours gating (steps 1-2) needs the phone-number module,
 * not built yet (Milestone 1.6) — Meta itself already enforces the
 * whitelist for test numbers in the meantime (docs/SETUP.md §3).
 */
export class RoutingService {
    decide(_call: Call, context: ContactContext | null = null): RoutingDecision {
        // picUsername is nusawa's own field name for the ticket's assigned
        // PIC — a separate system's identity concept. It's compared directly
        // against our (now email-keyed) presence registry because nusawa's
        // "username" values are themselves email-shaped in practice.
        if (context?.picUsername && presenceRegistry.isAvailable(context.picUsername)) {
            return { kind: "direct", targets: [context.picUsername] }
        }

        const targets = presenceRegistry.listAvailable().map((p) => p.email)

        if (targets.length === 0) {
            return { kind: "reject", targets: [], reason: EndReason.NO_AGENT_AVAILABLE }
        }

        return { kind: "broadcast", targets }
    }
}
