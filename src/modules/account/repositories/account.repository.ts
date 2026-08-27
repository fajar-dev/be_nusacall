import { EntityManager, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { Account } from "../entities/account.entity"
import { IAccountRepository } from "../interfaces/account.repository.interface"

export class TypeOrmAccountRepository implements IAccountRepository {
    private readonly repository: Repository<Account>

    constructor() {
        this.repository = AppDataSource.getRepository(Account)
    }

    async findAll(page: number, limit: number): Promise<{ data: Account[]; total: number }> {
        const [data, total] = await this.repository.findAndCount({
            order: { label: "ASC" },
            skip: (page - 1) * limit,
            take: limit,
        })
        return { data, total }
    }

    async findById(id: number): Promise<Account | null> {
        return await this.repository.findOneBy({ id })
    }

    async findByPhoneNumberId(phoneNumberId: string): Promise<Account | null> {
        return await this.repository.findOneBy({ phoneNumberId })
    }

    async save(data: Partial<Account>, manager?: EntityManager): Promise<Account> {
        const repo = manager ? manager.getRepository(Account) : this.repository
        return await repo.save(data)
    }

    merge(entity: Account, data: Partial<Account>): Account {
        return this.repository.merge(entity, data)
    }

    async delete(id: number): Promise<void> {
        await this.repository.delete(id)
    }
}
