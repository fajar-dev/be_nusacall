import { ContactListFilters, IContactRepository } from "./interfaces/contact.repository.interface"
import { Contact } from "./entities/contact.entity"
import { NotFoundException, BadRequestException } from "../../core/exceptions/base"
import { SortOrder } from "../../core/enums/sort-order.enum"
import { CreateContactValidator, UpdateContactValidator } from "./validators/contact.validator"
import { normalizePhoneNumber } from "../../core/helpers/phone-number"

export class ContactService {
    constructor(private readonly repository: IContactRepository) {}

    async getAll(
        page: number, limit: number, q?: string,
        filters: ContactListFilters = {}, sortBy?: string, order?: SortOrder,
    ): Promise<{ data: Contact[]; total: number }> {
        return await this.repository.findAll(page, limit, q, filters, sortBy, order)
    }

    async getById(id: number): Promise<Contact> {
        const contact = await this.repository.findById(id)
        if (!contact) {
            throw new NotFoundException("Contact not found")
        }
        return contact
    }

    async findByPhoneNumber(phoneNumber: string): Promise<Contact | null> {
        return await this.repository.findByPhoneNumber(normalizePhoneNumber(phoneNumber))
    }

    async create(data: CreateContactValidator): Promise<Contact> {
        const existing = await this.repository.findByPhoneNumber(data.phoneNumber)
        if (existing) {
            throw new BadRequestException("A contact with this phone number already exists")
        }
        const { branchIds, ...rest } = data
        const saved = await this.repository.save(rest as Partial<Contact>)
        if (branchIds) {
            await this.repository.setBranches(saved.id, branchIds)
        }
        return await this.getById(saved.id)
    }

    async update(id: number, data: UpdateContactValidator): Promise<Contact> {
        const contact = await this.getById(id)

        if (data.phoneNumber && data.phoneNumber !== contact.phoneNumber) {
            const existing = await this.repository.findByPhoneNumber(data.phoneNumber)
            if (existing && existing.id !== id) {
                throw new BadRequestException("A contact with this phone number already exists")
            }
        }

        const { branchIds, ...rest } = data
        const merged = this.repository.merge(contact, rest as Partial<Contact>)
        await this.repository.save(merged)
        if (branchIds) {
            await this.repository.setBranches(id, branchIds)
        }
        return await this.getById(id)
    }

    async delete(id: number): Promise<void> {
        await this.getById(id)
        await this.repository.delete(id)
    }

    async findOrCreate(rawPhoneNumber: string, name: string | null): Promise<Contact> {
        const phoneNumber = normalizePhoneNumber(rawPhoneNumber)

        const existing = await this.repository.findByPhoneNumber(phoneNumber)
        if (existing) return existing

        try {
            return await this.repository.save({ phoneNumber, name })
        } catch (err) {
            const raced = await this.repository.findByPhoneNumber(phoneNumber)
            if (raced) return raced
            throw err
        }
    }
}
