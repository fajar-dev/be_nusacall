import { Branch } from "../entities/branch.entity"
import { IBranchRepository } from "../interfaces/branch.repository.interface"
import { BaseRepository } from "../../../core/repositories/base.repository"

export class BranchRepository extends BaseRepository<Branch> implements IBranchRepository {
    constructor() {
        super(Branch)
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

    async findList(): Promise<Branch[]> {
        return await this.repository.find({ order: { name: 'ASC' } })
    }
}
