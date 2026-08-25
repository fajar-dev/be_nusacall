import { EntityManager, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { Organization } from "../entities/organization.entity"
import { IOrganizationRepository } from "../interfaces/organization.repository.interface"

export class OrganizationRepository implements IOrganizationRepository {
    private readonly repository: Repository<Organization>

    constructor() {
        this.repository = AppDataSource.getRepository(Organization)
    }

    async findAll(page: number, limit: number, q: string, sortBy?: string, order?: 'ASC' | 'DESC'): Promise<{ data: Organization[]; total: number }> {
        const offset = (page - 1) * limit

        const query = this.repository.createQueryBuilder("organization")
            .leftJoinAndSelect("organization.parent", "parent")

        if (q) {
            query.where(
                "(organization.name LIKE :q OR organization.type LIKE :q OR organization.description LIKE :q)",
                { q: `%${q}%` }
            )
        }

        const total = await query.getCount()

        const sortColumnMap: Record<string, string> = {
            name: "organization.name",
            type: "organization.type",
            parent: "parent.name",
            isActive: "organization.isActive",
        }
        const sortColumn = sortColumnMap[sortBy || ''] || "organization.id"
        const sortOrder = order === 'ASC' ? 'ASC' : 'DESC'

        const data = await query
            .orderBy(sortColumn, sortOrder)
            .skip(offset)
            .take(limit)
            .getMany()

        return { data, total }
    }

    async findList(): Promise<Organization[]> {
        return await this.repository.find({ order: { name: "ASC" } })
    }

    async findById(id: number): Promise<Organization | null> {
        return await this.repository.findOne({ where: { id }, relations: ["parent"] })
    }

    async countChildren(id: number): Promise<number> {
        return await this.repository.count({ where: { parentId: id } })
    }

    async save(data: Partial<Organization>, manager?: EntityManager): Promise<Organization> {
        const repo = manager ? manager.getRepository(Organization) : this.repository
        return await repo.save(data)
    }

    merge(entity: Organization, data: Partial<Organization>): Organization {
        return this.repository.merge(entity, data)
    }

    async delete(id: number): Promise<void> {
        await this.repository.delete(id)
    }
}