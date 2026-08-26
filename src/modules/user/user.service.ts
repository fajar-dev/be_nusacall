import { User } from "./entities/user.entity"
import { NotFoundException, BadRequestException } from "../../core/exceptions/base"
import { EntityManager } from "typeorm"
import { IUserRepository, UserListFilters } from "./interfaces/user.repository.interface"
import { minio } from "../../infrastructure/minio/minio.client"
import { presenceRegistry } from "./presence.registry"

export class UserService {
    constructor(private readonly repository: IUserRepository) {}

    async getAll(page: number, limit: number, q: string, filters: UserListFilters = {}, sortBy?: string, order?: 'ASC' | 'DESC'): Promise<{ data: User[]; total: number }> {
        return await this.repository.findAll(page, limit, q, filters, sortBy, order)
    }

    /** Lightweight picker search — no relation population, active users only, capped result count. */
    async searchOptions(q: string, limit: number): Promise<User[]> {
        return await this.repository.searchOptions(q, limit)
    }

    async getById(id: number): Promise<User> {
        const user = await this.repository.findById(id)
        if (!user) {
            throw new NotFoundException("User not found")
        }
        return user
    }

    async getByEmail(email: string): Promise<User | null> {
        return await this.repository.findByEmail(email)
    }

    /** Users currently online (live WebSocket connection) and free to take a call. */
    async getAvailable(): Promise<User[]> {
        const emails = presenceRegistry.listAvailable().map((p) => p.email)
        return await this.repository.findByEmails(emails)
    }

    async save(data: Partial<User>, manager?: EntityManager): Promise<User> {
        return await this.repository.save(data, manager)
    }

    async saveInTransaction(data: Partial<User>): Promise<User> {
        return await this.repository.saveInTransaction(data)
    }

    /** Reloads via getById() so the response includes the joined organization. */
    async create(data: Partial<User>): Promise<User> {
        if (data.email) {
            const existing = await this.repository.findByEmail(data.email)
            if (existing) {
                throw new BadRequestException("Email already in use")
            }
        }
        if (data.photo !== undefined) {
            data.photo = minio.sanitizePath(data.photo) ?? undefined
        }
        const saved = await this.repository.save(data)
        return await this.getById(saved.id)
    }

    async update(id: number, data: Partial<User>): Promise<User> {
        const user = await this.getById(id)
        if (data.email && data.email !== user.email) {
            const existing = await this.repository.findByEmail(data.email)
            if (existing) {
                throw new BadRequestException("Email already in use")
            }
        }
        if (data.photo !== undefined) {
            data.photo = minio.sanitizePath(data.photo) ?? undefined
        }
        this.repository.merge(user, data)
        await this.repository.save(user)
        return await this.getById(id)
    }

    async delete(id: number): Promise<void> {
        const user = await this.getById(id)
        await this.repository.delete(user.id)
    }
}