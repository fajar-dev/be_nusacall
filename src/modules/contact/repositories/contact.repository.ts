import { EntityManager, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { Contact } from "../entities/contact.entity"
import { IContactRepository } from "../interfaces/contact.repository.interface"

export class TypeOrmContactRepository implements IContactRepository {
    private readonly repository: Repository<Contact>

    constructor() {
        this.repository = AppDataSource.getRepository(Contact)
    }

    async findAll(page: number, limit: number, q?: string): Promise<{ data: Contact[]; total: number }> {
        const query = this.repository.createQueryBuilder("contact")

        if (q) {
            query.andWhere("(contact.waId LIKE :q OR contact.profileName LIKE :q)", { q: `%${q}%` })
        }

        const total = await query.getCount()
        const data = await query
            .orderBy("contact.createdAt", "DESC")
            .skip((page - 1) * limit)
            .take(limit)
            .getMany()

        return { data, total }
    }

    async findById(id: number): Promise<Contact | null> {
        return await this.repository.findOneBy({ id })
    }

    async findByWaId(waId: string): Promise<Contact | null> {
        return await this.repository.findOneBy({ waId })
    }

    async save(data: Partial<Contact>, manager?: EntityManager): Promise<Contact> {
        const repo = manager ? manager.getRepository(Contact) : this.repository
        return await repo.save(data)
    }

    merge(entity: Contact, data: Partial<Contact>): Contact {
        return this.repository.merge(entity, data)
    }

    async delete(id: number): Promise<void> {
        await this.repository.delete(id)
    }
}
