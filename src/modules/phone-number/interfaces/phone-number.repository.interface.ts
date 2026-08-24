import { PhoneNumber } from "../entities/phone-number.entity"
import { IBaseRepository } from "../../../core/interfaces/base.repository.interface"

export interface IPhoneNumberRepository extends IBaseRepository<PhoneNumber> {
    findAll(page: number, limit: number): Promise<{ data: PhoneNumber[]; total: number }>
    findByPhoneNumberId(phoneNumberId: string): Promise<PhoneNumber | null>
}
