import { Branch } from "./entities/branch.entity"
import { NotFoundException, ConflictException } from "../../core/exceptions/base"
import { EntityManager } from "typeorm"
import { AppDataSource } from "../../config/database"
import { IBranchRepository } from "./interfaces/branch.repository.interface"

export class BranchService {
    constructor(private readonly repository: IBranchRepository) {}

    async getAll(page: number, limit: number, q: string, sortBy?: string, order?: 'ASC' | 'DESC'): Promise<{ data: Branch[]; total: number }> {
        return await this.repository.findAll(page, limit, q, sortBy, order)
    }

    async getList(): Promise<Branch[]> {
        return await this.repository.findList()
    }

    async getById(id: number): Promise<Branch> {
        const branch = await this.repository.findById(id)
        if (!branch) {
            throw new NotFoundException("Branch not found")
        }
        return branch
    }

    async create(data: Partial<Branch>): Promise<Branch> {
        const saved = await this.repository.save(data)
        if (!data.code) {
            saved.code = String(saved.id)
            return await this.repository.save(saved)
        }
        return saved
    }

    async update(id: number, data: Partial<Branch>): Promise<Branch> {
        const branch = await this.getById(id)
        this.repository.merge(branch, data)
        return await this.repository.save(branch)
    }

    async delete(id: number): Promise<void> {
        await this.getById(id)
        await this.repository.delete(id)
    }

    async save(data: Partial<Branch>, manager?: EntityManager): Promise<Branch> {
        return await this.repository.save(data, manager)
    }
}
