import { Agent } from "../entities/agent.entity"
import { IBaseRepository } from "../../../core/interfaces/base.repository.interface"

export interface IAgentRepository extends IBaseRepository<Agent> {
    findByUsername(username: string): Promise<Agent | null>
    findAll(page: number, limit: number, q: string): Promise<{ data: Agent[]; total: number }>
    findAllAvailableForCalls(): Promise<Agent[]>
}
