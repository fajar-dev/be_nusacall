import { Contact } from "../entities/contact.entity"
import { IBaseRepository } from "../../../core/interfaces/base.repository.interface"
import { SortOrder } from "../../../core/enums/sort-order.enum"

export interface ContactListFilters {
    branchId?: string
}

export interface IContactRepository extends IBaseRepository<Contact> {
    findAll(page: number, limit: number, q?: string, filters?: ContactListFilters, sortBy?: string, order?: SortOrder): Promise<{ data: Contact[]; total: number }>
    findByPhoneNumber(phoneNumber: string): Promise<Contact | null>
    setBranches(contactId: number, branchIds: number[]): Promise<void>
}
