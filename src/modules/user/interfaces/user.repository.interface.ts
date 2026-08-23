import { EntityManager } from "typeorm"
import { User } from "../entities/user.entity"
import { IBaseRepository, SortOrder } from "../../../core/interfaces/base.repository.interface"

export interface UserListFilters {
    isActive?: string
}

export interface IUserRepository extends IBaseRepository<User> {
    findAll(page: number, limit: number, q: string, filters?: UserListFilters, sortBy?: string, order?: SortOrder): Promise<{ data: any[]; total: number }>
    findByEmail(email: string): Promise<User | null>
    findByEmailWithPassword(email: string): Promise<User | null>
    findByIdWithPassword(id: number): Promise<User | null>
    findByResetToken(token: string): Promise<User | null>
    findByEmailAndResetToken(email: string, token: string): Promise<User | null>
    saveInTransaction(data: Partial<User>): Promise<User>
}
