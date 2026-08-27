import { EntityManager, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { Branch } from "../entities/branch.entity"
import { IBranchRepository } from "../interfaces/branch.repository.interface"

export class BranchRepository implements IBranchRepository {
    private readonly repository: Repository<Branch>

    constructor() {
        this.repository = AppDataSource.getRepository(Branch)
    }

    async findAll(page: number, limit: number, q: string, sortBy?: string, order?: 'ASC' | 'DESC'): Promise<{ data: Branch[]; total: number }> {
        const offset = (page - 1) * limit

        const query = this.repository.createQueryBuilder("branch")

        if (q) {
            query.where(
                "(branch.name LIKE :q OR branch.code LIKE :q OR branch.description LIKE :q)",
                { q: `%${q}%` }
            )
        }

        const total = await query.getCount()

        // Whitelist of allowed sort columns
        const sortColumnMap: Record<string, string> = {
            code: "branch.code",
            name: "branch.name",
            description: "branch.description",
        }

        const sortColumn = sortColumnMap[sortBy || ''] || "branch.id"
        const sortOrder = order === 'ASC' ? 'ASC' : 'DESC'

        const data = await query
            .orderBy(sortColumn, sortOrder)
            .skip(offset)
            .take(limit)
            .getMany()

        return { data, total }
    }

    async findById(id: number): Promise<Branch | null> {
        return await this.repository.findOneBy({ id })
    }

    async findList(): Promise<Branch[]> {
        return await this.repository.find({ order: { name: 'ASC' } })
    }

    async save(data: Partial<Branch>, manager?: EntityManager): Promise<Branch> {
        const repo = manager ? manager.getRepository(Branch) : this.repository
        return await repo.save(data)
    }

    merge(entity: Branch, data: Partial<Branch>): Branch {
        return this.repository.merge(entity, data)
    }

    async delete(id: number): Promise<void> {
        await this.repository.delete(id)
    }
}
