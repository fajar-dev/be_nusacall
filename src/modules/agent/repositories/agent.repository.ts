import { EntityManager, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { Agent } from "../entities/agent.entity"
import { IAgentRepository } from "../interfaces/agent.repository.interface"

export class TypeOrmAgentRepository implements IAgentRepository {
    private readonly repository: Repository<Agent>

    constructor() {
        this.repository = AppDataSource.getRepository(Agent)
    }

    async findById(id: number): Promise<Agent | null> {
        return await this.repository.findOneBy({ id })
    }

    async findByUsername(username: string): Promise<Agent | null> {
        return await this.repository.findOneBy({ username })
    }

    async findAll(page: number, limit: number, q: string): Promise<{ data: Agent[]; total: number }> {
        const offset = (page - 1) * limit
        const query = this.repository.createQueryBuilder("agent")

        if (q) {
            query.where("(agent.username LIKE :q OR agent.displayName LIKE :q)", { q: `%${q}%` })
        }

        const total = await query.getCount()
        const data = await query.orderBy("agent.username", "ASC").skip(offset).take(limit).getMany()

        return { data, total }
    }

    async findAllAvailableForCalls(): Promise<Agent[]> {
        return await this.repository.findBy({ canReceiveCalls: true })
    }

    async save(data: Partial<Agent>, manager?: EntityManager): Promise<Agent> {
        const repo = manager ? manager.getRepository(Agent) : this.repository
        return await repo.save(data)
    }

    merge(entity: Agent, data: Partial<Agent>): Agent {
        return this.repository.merge(entity, data)
    }

    async delete(id: number): Promise<void> {
        await this.repository.delete(id)
    }
}
