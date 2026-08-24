import { EntityManager, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { PhoneNumber } from "../entities/phone-number.entity"
import { IPhoneNumberRepository } from "../interfaces/phone-number.repository.interface"

export class TypeOrmPhoneNumberRepository implements IPhoneNumberRepository {
    private readonly repository: Repository<PhoneNumber>

    constructor() {
        this.repository = AppDataSource.getRepository(PhoneNumber)
    }

    async findAll(page: number, limit: number): Promise<{ data: PhoneNumber[]; total: number }> {
        const [data, total] = await this.repository.findAndCount({
            order: { label: "ASC" },
            skip: (page - 1) * limit,
            take: limit,
        })
        return { data, total }
    }

    async findById(id: number): Promise<PhoneNumber | null> {
        return await this.repository.findOneBy({ id })
    }

    async findByPhoneNumberId(phoneNumberId: string): Promise<PhoneNumber | null> {
        return await this.repository.findOneBy({ phoneNumberId })
    }

    async save(data: Partial<PhoneNumber>, manager?: EntityManager): Promise<PhoneNumber> {
        const repo = manager ? manager.getRepository(PhoneNumber) : this.repository
        return await repo.save(data)
    }

    merge(entity: PhoneNumber, data: Partial<PhoneNumber>): PhoneNumber {
        return this.repository.merge(entity, data)
    }

    async delete(id: number): Promise<void> {
        await this.repository.delete(id)
    }
}
