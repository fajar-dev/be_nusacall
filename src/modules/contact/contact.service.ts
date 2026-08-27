import { IContactRepository } from "./interfaces/contact.repository.interface"
import { Contact } from "./entities/contact.entity"
import { NotFoundException } from "../../core/exceptions/base"

export class ContactService {
    constructor(private readonly repository: IContactRepository) {}

    async getAll(page: number, limit: number, q?: string): Promise<{ data: Contact[]; total: number }> {
        return await this.repository.findAll(page, limit, q)
    }

    async getById(id: number): Promise<Contact> {
        const contact = await this.repository.findById(id)
        if (!contact) {
            throw new NotFoundException("Contact not found")
        }
        return contact
    }

    async findByWaId(waId: string): Promise<Contact | null> {
        return await this.repository.findByWaId(waId)
    }

    /** Saves a new contact on first sight of a waId; an existing contact is left untouched. */
    async findOrCreate(waId: string, profileName: string | null): Promise<Contact> {
        const existing = await this.repository.findByWaId(waId)
        if (existing) return existing

        try {
            return await this.repository.save({ waId, profileName })
        } catch (err) {
            const raced = await this.repository.findByWaId(waId)
            if (raced) return raced
            throw err
        }
    }
}
