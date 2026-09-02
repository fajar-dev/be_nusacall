import { User } from "../entities/user.entity"
import { IBaseRepository } from "../../../core/interfaces/base.repository.interface"
import { SortOrder } from "../../../core/enums/sort-order.enum"

export interface UserListFilters {
    isActive?: string
    organizationId?: string
    branchId?: string
}

export interface IUserRepository extends IBaseRepository<User> {
    findAll(page: number, limit: number, q: string, filters?: UserListFilters, sortBy?: string, order?: SortOrder, onlineEmails?: string[]): Promise<{ data: User[]; total: number }>
    findByEmail(email: string): Promise<User | null>
    findByEmails(emails: string[]): Promise<User[]>
    saveInTransaction(data: Partial<User>): Promise<User>
    searchOptions(q: string, limit: number): Promise<User[]>
}
