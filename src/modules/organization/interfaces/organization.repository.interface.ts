import { EntityManager } from "typeorm"
import { Organization } from "../entities/organization.entity"
import { SortOrder } from "../../../core/enums/sort-order.enum"

export interface IOrganizationRepository {
    findAll(page: number, limit: number, q: string, sortBy?: string, order?: SortOrder): Promise<{ data: Organization[]; total: number }>
    findList(): Promise<Organization[]>
    findById(id: number): Promise<Organization | null>
    countChildren(id: number): Promise<number>
    save(data: Partial<Organization>, manager?: EntityManager): Promise<Organization>
    merge(entity: Organization, data: Partial<Organization>): Organization
    delete(id: number): Promise<void>
}
