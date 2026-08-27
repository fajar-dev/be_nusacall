import { Contact } from "../entities/contact.entity"
import { IBaseRepository } from "../../../core/interfaces/base.repository.interface"

export interface IContactRepository extends IBaseRepository<Contact> {
    findAll(page: number, limit: number, q?: string): Promise<{ data: Contact[]; total: number }>
    findByWaId(waId: string): Promise<Contact | null>
}
