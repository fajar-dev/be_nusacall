import { Contact } from "./entities/contact.entity"
import { NotFoundException } from "../../core/exceptions/base"
import { EntityManager } from "typeorm"
import { IContactRepository } from "./interfaces/contact.repository.interface"
import { SortOrder } from "../../core/interfaces/base.repository.interface"

export class ContactService {
    constructor(private readonly repository: IContactRepository) {}

    async getAll(page: number, limit: number, q: string, sortBy?: string, order?: SortOrder): Promise<{ data: Contact[]; total: number }> {
        return await this.repository.findAll(page, limit, q, sortBy, order)
    }

    async getById(id: number): Promise<Contact> {
        const contact = await this.repository.findById(id)
        if (!contact) {
            throw new NotFoundException("Contact not found")
        }
        return contact
    }

    async create(data: Partial<Contact>): Promise<Contact> {
        return await this.repository.save(data)
    }

    async update(id: number, data: Partial<Contact>): Promise<Contact> {
        const contact = await this.getById(id)
        this.repository.merge(contact, data)
        return await this.repository.save(contact)
    }

    async delete(id: number): Promise<void> {
        await this.getById(id)
        await this.repository.delete(id)
    }

    async save(data: Partial<Contact>, manager?: EntityManager): Promise<Contact> {
        return await this.repository.save(data, manager)
    }
}
