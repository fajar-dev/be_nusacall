import { Call } from "../call/entities/call.entity"
import { EndReason } from "../call/enum/end-reason.enum"
import { presenceRegistry } from "../user/presence.registry"

export interface RoutingDecision {
    kind: "direct" | "broadcast" | "reject"
    targets: string[]
    reason?: EndReason
}

/** Ticket context looked up from nusawa right before routing. */
export interface ContactContext {
    inboxId: number | null
    contactName: string | null
    lastMessage: string | null
    tags: string[]
    picUsername: string | null
    nusawaThreadUrl: string | null
}

/**
 * Chooses which agent(s) to ring for an inbound call: a PIC who's online gets it directly,
 * otherwise broadcast to every available agent, first answer wins. Whitelist/call-hours gating
 * isn't implemented yet — Meta itself already enforces the whitelist for test numbers in the meantime.
 */
export class RoutingService {
    decide(_call: Call, context: ContactContext | null = null): RoutingDecision {
        // picUsername is nusawa's field name for the ticket's assigned PIC. It's compared directly
        // against our email-keyed presence registry because nusawa's "username" values are email-shaped.
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
