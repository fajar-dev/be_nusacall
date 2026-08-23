import { EntityManager, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { Contact } from "../entities/contact.entity"
import { IContactRepository } from "../interfaces/contact.repository.interface"
import { SortOrder } from "../../../core/interfaces/base.repository.interface"

const SORTABLE_COLUMNS: Record<string, string> = {
    name: "contact.name",
    email: "contact.email",
    phone: "contact.phone",
    type: "contact.type",
    isActive: "contact.isActive",
    createdAt: "contact.createdAt",
}

export class TypeOrmContactRepository implements IContactRepository {
    private readonly repository: Repository<Contact>

    constructor() {
        this.repository = AppDataSource.getRepository(Contact)
    }

    async findAll(page: number, limit: number, q: string, sortBy?: string, order: SortOrder = "DESC"): Promise<{ data: Contact[]; total: number }> {
        const offset = (page - 1) * limit

        const query = this.repository.createQueryBuilder("contact")

        if (q) {
            query.where(
                "(contact.name LIKE :q OR contact.email LIKE :q OR contact.phone LIKE :q)",
                { q: `%${q}%` }
            )
        }

        const total = await query.getCount()

        const orderColumn = (sortBy && SORTABLE_COLUMNS[sortBy]) || "contact.id"

        const data = await query
            .orderBy(orderColumn, order)
            .skip(offset)
            .take(limit)
            .getMany()

        return { data, total }
    }

    async findById(id: number): Promise<Contact | null> {
        return await this.repository.findOneBy({ id })
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
