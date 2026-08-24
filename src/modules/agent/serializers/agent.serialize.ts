import { Agent } from "../entities/agent.entity"
import { presenceRegistry } from "../presence.registry"

export class AgentSerializer {
    static single(agent: Agent) {
        const presence = presenceRegistry.get(agent.username)
        return {
            username: agent.username,
            displayName: agent.displayName,
            role: agent.role,
            canReceiveCalls: agent.canReceiveCalls,
            availability: presence?.availability ?? "offline",
            currentCallId: presence?.currentCallId ?? null,
            totalCallsHandled: agent.totalCallsHandled,
            lastSeenAt: agent.lastSeenAt,
        }
    }

    static collection(agents: Agent[]) {
        return agents.map((a) => this.single(a))
    }
}
