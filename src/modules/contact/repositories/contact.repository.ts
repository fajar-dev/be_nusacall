import { AppDataSource } from "../../../config/database"
import { Contact } from "../entities/contact.entity"
import { ContactBranch } from "../entities/contact-branch.entity"
import { ContactListFilters, IContactRepository } from "../interfaces/contact.repository.interface"
import { BaseRepository } from "../../../core/repositories/base.repository"
import { SortOrder } from "../../../core/enums/sort-order.enum"

export class TypeOrmContactRepository extends BaseRepository<Contact> implements IContactRepository {
    constructor() {
        super(Contact)
    }

    async findAll(
        page: number, limit: number, q?: string,
        filters: ContactListFilters = {}, sortBy?: string, order?: SortOrder,
    ): Promise<{ data: Contact[]; total: number }> {
        const query = this.repository.createQueryBuilder("contact")
            .leftJoinAndSelect("contact.contactBranches", "contactBranch")
            .leftJoinAndSelect("contactBranch.branch", "branch")

        if (q) {
            query.andWhere("(contact.phoneNumber LIKE :q OR contact.name LIKE :q)", { q: `%${q}%` })
        }

        if (filters.branchId !== undefined && filters.branchId !== "") {
            query.andWhere(
                "EXISTS (SELECT 1 FROM contact_branches cb WHERE cb.contact_id = contact.id AND cb.branch_id = :branchId)",
                { branchId: Number(filters.branchId) }
            )
        }

        const total = await query.getCount()

        const sortColumnMap: Record<string, string> = {
            name: "contact.name",
            phoneNumber: "contact.phoneNumber",
            timeZone: "contact.timeZone",
            createdAt: "contact.createdAt",
        }

        const data = await query
            .orderBy(sortColumnMap[sortBy || ''] || "contact.createdAt", order === SortOrder.ASC ? SortOrder.ASC : SortOrder.DESC)
            .skip((page - 1) * limit)
            .take(limit)
            .getMany()

        return { data, total }
    }

    async findById(id: number): Promise<Contact | null> {
        return await this.repository.findOne({ where: { id }, relations: { contactBranches: { branch: true } } })
    }

    async findByPhoneNumber(phoneNumber: string): Promise<Contact | null> {
        return await this.repository.findOneBy({ phoneNumber })
    }

    async setBranches(contactId: number, branchIds: number[]): Promise<void> {
        const repository = AppDataSource.getRepository(ContactBranch)
        await repository.delete({ contactId })
        if (branchIds.length) {
            await repository.insert(branchIds.map((branchId) => ({ contactId, branchId })))
        }
    }
}
