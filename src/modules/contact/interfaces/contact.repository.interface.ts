import { Contact } from "../entities/contact.entity"
import { IBaseRepository, SortOrder } from "../../../core/interfaces/base.repository.interface"

export interface IContactRepository extends IBaseRepository<Contact> {
    findAll(page: number, limit: number, q: string, sortBy?: string, order?: SortOrder): Promise<{ data: Contact[]; total: number }>
}
