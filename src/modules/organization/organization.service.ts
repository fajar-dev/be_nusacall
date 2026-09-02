import { IsNull } from "typeorm"
import { Organization } from "./entities/organization.entity"
import { NotFoundException, ConflictException, BadRequestException } from "../../core/exceptions/base"
import { IOrganizationRepository } from "./interfaces/organization.repository.interface"
import { AppDataSource } from "../../config/database"
import { SortOrder } from "../../core/enums/sort-order.enum"

export class OrganizationService {
    constructor(private readonly repository: IOrganizationRepository) {}

    async getAll(page: number, limit: number, q: string, sortBy?: string, order?: SortOrder): Promise<{ data: Organization[]; total: number }> {
        return await this.repository.findAll(page, limit, q, sortBy, order)
    }

    async getList(): Promise<Organization[]> {
        return await this.repository.findList()
    }

    async getById(id: number): Promise<Organization> {
        const org = await this.repository.findById(id)
        if (!org) {
            throw new NotFoundException("Organization not found")
        }
        return org
    }

    async create(data: Partial<Organization>): Promise<Organization> {
        if (data.parentId) {
            await this.assertParentExists(data.parentId)
        }
        const saved = await this.repository.save(data)
        return await this.getById(saved.id)
    }

    async update(id: number, data: Partial<Organization>): Promise<Organization> {
        const org = await this.getById(id)

        if (data.parentId !== undefined && data.parentId !== null) {
            if (data.parentId === id) {
                throw new BadRequestException("An organization cannot be its own parent")
            }
            await this.assertParentExists(data.parentId)
            const descendantIds = await this.getDescendantIds(id)
            if (descendantIds.includes(data.parentId)) {
                throw new BadRequestException("Cannot move an organization under its own sub-organization")
            }
        }

        if (data.parentId !== undefined) {
            org.parent = undefined as any
        }
        this.repository.merge(org, data)
        await this.repository.save(org)
        return await this.getById(id)
    }

    async delete(id: number): Promise<void> {
        await this.getById(id)
        const childCount = await this.repository.countChildren(id)
        if (childCount > 0) {
            throw new ConflictException(`Cannot delete organization, ${childCount} sub-organization(s) are still linked to this organization`)
        }
        await this.repository.delete(id)
    }

    private async assertParentExists(parentId: number): Promise<void> {
        const parent = await this.repository.findById(parentId)
        if (!parent) {
            throw new NotFoundException("Parent organization not found")
        }
    }

    private async getDescendantIds(id: number): Promise<number[]> {
        const flat = await this.repository.findList()
        const childrenMap = new Map<number, number[]>()
        for (const org of flat) {
            if (org.parentId != null) {
                if (!childrenMap.has(org.parentId)) childrenMap.set(org.parentId, [])
                childrenMap.get(org.parentId)!.push(org.id)
            }
        }

        const result: number[] = []
        const stack = [...(childrenMap.get(id) || [])]
        while (stack.length) {
            const current = stack.pop()!
            result.push(current)
            stack.push(...(childrenMap.get(current) || []))
        }
        return result
    }
}
