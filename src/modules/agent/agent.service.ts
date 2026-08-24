import { Agent } from "./entities/agent.entity"
import { IAgentRepository } from "./interfaces/agent.repository.interface"
import { NotFoundException } from "../../core/exceptions/base"

export interface UpsertAgentInput {
    username: string
    displayName?: string | null
    role?: string | null
    canReceiveCalls?: boolean
}

export class AgentService {
    constructor(private readonly repository: IAgentRepository) {}

    async getAll(page: number, limit: number, q: string): Promise<{ data: Agent[]; total: number }> {
        return await this.repository.findAll(page, limit, q)
    }

    async getByUsername(username: string): Promise<Agent> {
        const agent = await this.repository.findByUsername(username)
        if (!agent) {
            throw new NotFoundException("Agent not found")
        }
        return agent
    }

    async getAvailableForCalls(): Promise<Agent[]> {
        return await this.repository.findAllAvailableForCalls()
    }

    /**
     * Called on every successful login (relay to nusawa GET /api/me).
     * Creates the Agent row on first login, refreshes the identity snapshot
     * (displayName, role) on subsequent logins. Never touches canReceiveCalls
     * on an existing row — that switch belongs to the admin, not to login.
     */
    async upsert(input: UpsertAgentInput): Promise<Agent> {
        const existing = await this.repository.findByUsername(input.username)

        if (existing) {
            this.repository.merge(existing, {
                displayName: input.displayName ?? existing.displayName,
                role: input.role ?? existing.role,
                lastSeenAt: new Date(),
            })
            return await this.repository.save(existing)
        }

        return await this.repository.save({
            username: input.username,
            displayName: input.displayName ?? null,
            role: input.role ?? null,
            canReceiveCalls: input.canReceiveCalls ?? true,
            lastSeenAt: new Date(),
        })
    }

    async setCanReceiveCalls(username: string, canReceiveCalls: boolean): Promise<Agent> {
        const agent = await this.getByUsername(username)
        this.repository.merge(agent, { canReceiveCalls })
        return await this.repository.save(agent)
    }

    async touchLastSeen(username: string): Promise<void> {
        const agent = await this.repository.findByUsername(username)
        if (!agent) return
        this.repository.merge(agent, { lastSeenAt: new Date() })
        await this.repository.save(agent)
    }

    async incrementCallsHandled(username: string): Promise<void> {
        const agent = await this.repository.findByUsername(username)
        if (!agent) return
        this.repository.merge(agent, { totalCallsHandled: agent.totalCallsHandled + 1 })
        await this.repository.save(agent)
    }
}
