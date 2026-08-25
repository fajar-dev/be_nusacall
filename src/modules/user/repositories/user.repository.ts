import { EntityManager, IsNull, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { User } from "../entities/user.entity"
import { IUserRepository, UserListFilters } from "../interfaces/user.repository.interface"

export class UserRepository implements IUserRepository {
    private readonly repository: Repository<User>

    constructor() {
        this.repository = AppDataSource.getRepository(User)
    }

    async findAll(page: number, limit: number, q: string, filters: UserListFilters = {}, sortBy?: string, order?: 'ASC' | 'DESC'): Promise<{ data: User[]; total: number }> {
        const offset = (page - 1) * limit

        const query = this.repository.createQueryBuilder("user")
            .leftJoinAndSelect("user.organization", "organization")
            .where("user.deleted_at IS NULL")

        if (q) {
            query.andWhere(
                "(user.name LIKE :q OR user.email LIKE :q)",
                { q: `%${q}%` }
            )
        }

        if (filters.isActive !== undefined && filters.isActive !== "") {
            query.andWhere("user.isActive = :isActive", { isActive: filters.isActive === "true" || filters.isActive === "1" })
        }

        // Get total count before pagination
        const total = await query.getCount()

        // Whitelist of allowed sort columns
        const sortColumnMap: Record<string, string> = {
            name: "user.name",
            email: "user.email",
            isActive: "user.isActive",
            createdAt: "user.createdAt",
        }

        const sortColumn = sortColumnMap[sortBy || ''] || "user.id"
        const sortOrder = order === 'ASC' ? 'ASC' : 'DESC'

        // Get paginated data
        const data = await query
            .orderBy(sortColumn, sortOrder)
            .skip(offset)
            .take(limit)
            .getMany()

        return { data, total }
    }

    async searchOptions(q: string, limit: number): Promise<User[]> {
        const query = this.repository
            .createQueryBuilder("user")
            .select(["user.id", "user.name", "user.email", "user.photo"])
            .where("user.deleted_at IS NULL")
            .andWhere("user.isActive = :isActive", { isActive: true })
            .orderBy("user.name", "ASC")
            .take(limit)

        if (q) {
            query.andWhere("(user.name LIKE :q OR user.email LIKE :q)", { q: `%${q}%` })
        }

        return await query.getMany()
    }

    async findById(id: number): Promise<User | null> {
        return await this.repository.createQueryBuilder("user")
            .leftJoinAndSelect("user.organization", "organization")
            .where("user.id = :id", { id })
            .andWhere("user.deleted_at IS NULL")
            .getOne()
    }

    async findByEmail(email: string): Promise<User | null> {
        return await this.repository.findOneBy({ email, deletedAt: IsNull() })
    }

    async findByEmails(emails: string[]): Promise<User[]> {
        if (emails.length === 0) return []
        return await this.repository.createQueryBuilder("user")
            .where("user.email IN (:...emails)", { emails })
            .andWhere("user.deleted_at IS NULL")
            .andWhere("user.isActive = :isActive", { isActive: true })
            .getMany()
    }

    async save(data: Partial<User>, manager?: EntityManager): Promise<User> {
        const repo = manager ? manager.getRepository(User) : this.repository
        return await repo.save(data)
    }

    merge(entity: User, data: Partial<User>): User {
        return this.repository.merge(entity, data)
    }

    async saveInTransaction(data: Partial<User>): Promise<User> {
        return AppDataSource.transaction(async (manager) => {
            return await manager.getRepository(User).save(data)
        })
    }

    async delete(id: number): Promise<void> {
        const now = new Date()
        await this.repository.update(id, {
            deletedAt: now,
            email: `deleted_${id}_${now.getTime()}@deleted`,
            isActive: false,
        })
    }
}