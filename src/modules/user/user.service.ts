import { User } from "./entities/user.entity"
import { NotFoundException, BadRequestException } from "../../core/exceptions/base"
import { EntityManager } from "typeorm"
import { IUserRepository, UserListFilters } from "./interfaces/user.repository.interface"
import { hashPassword } from "../../core/helpers/hash"
import { minio } from "../../core/helpers/minio"
import { SortOrder } from "../../core/interfaces/base.repository.interface"

export class UserService {
    constructor(private readonly repository: IUserRepository) {}

    async getAll(page: number, limit: number, q: string, filters: UserListFilters = {}, sortBy?: string, order?: SortOrder): Promise<{ data: any[]; total: number }> {
        return await this.repository.findAll(page, limit, q, filters, sortBy, order)
    }

    async getById(id: number): Promise<User> {
        const user = await this.repository.findById(id)
        if (!user) {
            throw new NotFoundException("User not found")
        }
        return user
    }

    async getByIdWithPassword(id: number): Promise<User> {
        const user = await this.repository.findByIdWithPassword(id)
        if (!user) {
            throw new NotFoundException("User not found")
        }
        return user
    }

    async getByEmail(email: string): Promise<User | null> {
        return await this.repository.findByEmail(email)
    }

    async getByEmailWithPassword(email: string): Promise<User | null> {
        return await this.repository.findByEmailWithPassword(email)
    }

    async getByResetToken(token: string): Promise<User | null> {
        return await this.repository.findByResetToken(token)
    }

    async getByEmailAndResetToken(email: string, token: string): Promise<User | null> {
        return await this.repository.findByEmailAndResetToken(email, token)
    }

    async save(data: Partial<User>, manager?: EntityManager): Promise<User> {
        return await this.repository.save(data, manager)
    }

    async saveInTransaction(data: Partial<User>): Promise<User> {
        return await this.repository.saveInTransaction(data)
    }

    async create(data: Partial<User>): Promise<User> {
        if (data.email) {
            const existing = await this.repository.findByEmail(data.email)
            if (existing) {
                throw new BadRequestException("Email already in use")
            }
        }
        if (data.password) {
            data.password = await hashPassword(data.password)
        }
        if (data.photo !== undefined) {
            data.photo = minio.sanitizePath(data.photo) ?? undefined
        }
        return await this.repository.save(data)
    }

    async update(id: number, data: Partial<User>): Promise<User> {
        const user = await this.getById(id)
        if (data.email && data.email !== user.email) {
            const existing = await this.repository.findByEmail(data.email)
            if (existing) {
                throw new BadRequestException("Email already in use")
            }
        }
        if (data.password) {
            data.password = await hashPassword(data.password)
        }
        if (data.photo !== undefined) {
            data.photo = minio.sanitizePath(data.photo) ?? undefined
        }
        this.repository.merge(user, data)
        return await this.repository.save(user)
    }

    async delete(id: number): Promise<void> {
        await this.getById(id)
        await this.repository.delete(id)
    }
}
