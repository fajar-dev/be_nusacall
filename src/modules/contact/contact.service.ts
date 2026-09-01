import { ContactListFilters, IContactRepository } from "./interfaces/contact.repository.interface"
import { Contact } from "./entities/contact.entity"
import { Branch } from "../branch/entities/branch.entity"
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
        const saved = await this.repository.save(this.withBranches(data))
        return await this.getById(saved.id)
    }

    private withBranches(data: { branchIds?: number[] }): Partial<Contact> {
        const { branchIds, ...rest } = data
        const payload = rest as Partial<Contact>
        if (branchIds) {
            payload.branches = branchIds.map((id) => ({ id }) as Branch)
        }
        return payload
    }

    async update(id: number, data: UpdateContactValidator): Promise<Contact> {
        const contact = await this.getById(id)

        if (data.phoneNumber && data.phoneNumber !== contact.phoneNumber) {
            const existing = await this.repository.findByPhoneNumber(data.phoneNumber)
            if (existing && existing.id !== id) {
                throw new BadRequestException("A contact with this phone number already exists")
            }
        }

        const merged = this.repository.merge(contact, this.withBranches(data))
        await this.repository.save(merged)
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
