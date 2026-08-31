import { AppDataSource } from "../../../config/database"
import { User } from "../entities/user.entity"
import { IUserRepository, UserListFilters } from "../interfaces/user.repository.interface"
import { BaseRepository } from "../../../core/repositories/base.repository"
import { SortOrder } from "../../../core/enums/sort-order.enum"

export class UserRepository extends BaseRepository<User> implements IUserRepository {
    constructor() {
        super(User)
    }

    async findAll(page: number, limit: number, q: string, filters: UserListFilters = {}, sortBy?: string, order?: SortOrder, onlineEmails: string[] = []): Promise<{ data: User[]; total: number }> {
        const offset = (page - 1) * limit

        const query = this.repository.createQueryBuilder("user")
            .leftJoinAndSelect("user.organization", "organization")
            .leftJoinAndSelect("user.branch", "branch")
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

        if (filters.organizationId !== undefined && filters.organizationId !== "") {
            query.andWhere("user.organizationId = :organizationId", { organizationId: Number(filters.organizationId) })
        }

        if (filters.branchId !== undefined && filters.branchId !== "") {
            query.andWhere("user.branchId = :branchId", { branchId: Number(filters.branchId) })
        }

        const total = await query.getCount()

        const sortColumnMap: Record<string, string> = {
            name: "user.name",
            email: "user.email",
            organization: "organization.name",
            branch: "branch.name",
            isActive: "user.isActive",
            createdAt: "user.createdAt",
        }

        const sortOrder = order === SortOrder.ASC ? SortOrder.ASC : SortOrder.DESC

        if (sortBy === "availability" && onlineEmails.length) {
            query
                .addSelect("CASE WHEN user.email IN (:...onlineEmails) THEN 0 ELSE 1 END", "online_rank")
                .setParameter("onlineEmails", onlineEmails)
                .orderBy("online_rank", sortOrder)
                .addOrderBy("user.id", SortOrder.ASC)
        } else {
            query.orderBy(sortColumnMap[sortBy || ''] || "user.id", sortOrder)
        }

        const data = await query
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
            .leftJoinAndSelect("user.branch", "branch")
            .where("user.id = :id", { id })
            .andWhere("user.deleted_at IS NULL")
            .getOne()
    }

    async findByEmail(email: string): Promise<User | null> {
        return await this.repository.createQueryBuilder("user")
            .leftJoinAndSelect("user.organization", "organization")
            .leftJoinAndSelect("user.branch", "branch")
            .where("user.email = :email", { email })
            .andWhere("user.deleted_at IS NULL")
            .getOne()
    }

    async findByEmails(emails: string[]): Promise<User[]> {
        if (emails.length === 0) return []
        return await this.repository.createQueryBuilder("user")
            .leftJoinAndSelect("user.organization", "organization")
            .leftJoinAndSelect("user.branch", "branch")
            .where("user.email IN (:...emails)", { emails })
            .andWhere("user.deleted_at IS NULL")
            .andWhere("user.isActive = :isActive", { isActive: true })
            .getMany()
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