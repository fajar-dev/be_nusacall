import { Account } from "../entities/account.entity"
import { IBaseRepository } from "../../../core/interfaces/base.repository.interface"

export interface IAccountRepository extends IBaseRepository<Account> {
    findAll(page: number, limit: number): Promise<{ data: Account[]; total: number }>
}
