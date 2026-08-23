import { EntityManager, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { User } from "../entities/user.entity"
import { IUserRepository, UserListFilters } from "../interfaces/user.repository.interface"
import { SortOrder } from "../../../core/interfaces/base.repository.interface"

const SORTABLE_COLUMNS: Record<string, string> = {
    name: "user.name",
    email: "user.email",
    isActive: "user.is_active",
    createdAt: "user.created_at",
}

export class TypeOrmUserRepository implements IUserRepository {
    private readonly repository: Repository<User>

    constructor() {
        this.repository = AppDataSource.getRepository(User)
    }

    async findAll(page: number, limit: number, q: string, filters: UserListFilters = {}, sortBy?: string, order: SortOrder = "DESC"): Promise<{ data: any[]; total: number }> {
        const offset = (page - 1) * limit

        const query = this.repository.createQueryBuilder("user")
            .select([
                "user.id AS id",
                "user.name AS name",
                "user.photo AS photo",
                "user.email AS email",
                "user.is_active AS isActive",
                "user.created_at AS createdAt",
            ])

        if (q) {
            query.where(
                "(user.name LIKE :q OR user.email LIKE :q)",
                { q: `%${q}%` }
            )
        }

        if (filters.isActive !== undefined && filters.isActive !== "") {
            query.andWhere("user.is_active = :isActive", { isActive: filters.isActive === "1" })
        }

        // Get total count (efficient)
        const total = await query.clone().getCount()

        // Get paginated data
        const orderColumn = (sortBy && SORTABLE_COLUMNS[sortBy]) || "user.id"

        const data = await query
            .orderBy(orderColumn, order)
            .limit(limit)
            .offset(offset)
            .getRawMany()

        return { data, total }
    }

    async findById(id: number): Promise<User | null> {
        return await this.repository.findOneBy({ id })
    }

    async findByEmail(email: string): Promise<User | null> {
        return await this.repository.findOneBy({ email })
    }

    async findByEmailWithPassword(email: string): Promise<User | null> {
        return await this.repository.createQueryBuilder("user")
            .where("user.email = :email", { email })
            .addSelect("user.password")
            .getOne()
    }

    async findByIdWithPassword(id: number): Promise<User | null> {
        return await this.repository.createQueryBuilder("user")
            .where("user.id = :id", { id })
            .addSelect("user.password")
            .getOne()
    }

    async findByResetToken(token: string): Promise<User | null> {
        return await this.repository.createQueryBuilder("user")
            .where("user.reset_password_token = :token", { token })
            .andWhere("user.reset_password_expires > :now", { now: new Date() })
            .getOne()
    }

    async findByEmailAndResetToken(email: string, token: string): Promise<User | null> {
        return await this.repository.createQueryBuilder("user")
            .where("user.email = :email", { email })
            .andWhere("user.reset_password_token = :token", { token })
            .andWhere("user.reset_password_expires > :now", { now: new Date() })
            .getOne()
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
        await this.repository.delete(id)
    }
}
