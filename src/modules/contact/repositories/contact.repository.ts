import { Contact } from "../entities/contact.entity"
import { IContactRepository } from "../interfaces/contact.repository.interface"
import { BaseRepository } from "../../../core/repositories/base.repository"

export class TypeOrmContactRepository extends BaseRepository<Contact> implements IContactRepository {
    constructor() {
        super(Contact)
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

    async findByWaId(waId: string): Promise<Contact | null> {
        return await this.repository.findOneBy({ waId })
    }
}
