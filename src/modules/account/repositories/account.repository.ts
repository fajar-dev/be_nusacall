import { Account } from "../entities/account.entity"
import { IAccountRepository } from "../interfaces/account.repository.interface"
import { BaseRepository } from "../../../core/repositories/base.repository"

export class TypeOrmAccountRepository extends BaseRepository<Account> implements IAccountRepository {
    constructor() {
        super(Account)
    }

    async findAll(page: number, limit: number): Promise<{ data: Account[]; total: number }> {
        const [data, total] = await this.repository.findAndCount({
            order: { label: "ASC" },
            skip: (page - 1) * limit,
            take: limit,
        })
        return { data, total }
    }

}
