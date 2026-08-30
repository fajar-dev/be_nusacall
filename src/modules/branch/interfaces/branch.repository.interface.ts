import { EntityManager } from "typeorm"
import { Branch } from "../entities/branch.entity"
import { SortOrder } from "../../../core/enums/sort-order.enum"

export interface IBranchRepository {
    findAll(page: number, limit: number, q: string, sortBy?: string, order?: SortOrder): Promise<{ data: Branch[]; total: number }>
    findList(): Promise<Branch[]>
    findById(id: number): Promise<Branch | null>
    save(data: Partial<Branch>, manager?: EntityManager): Promise<Branch>
    merge(entity: Branch, data: Partial<Branch>): Branch
    delete(id: number): Promise<void>
}
