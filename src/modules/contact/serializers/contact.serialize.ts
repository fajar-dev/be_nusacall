import { NusawaContactDTO, unwrapNullString } from "../../../infrastructure/nusawa/nusawa.types"

export class ContactSerializer {
    static single(contact: NusawaContactDTO) {
        return {
            phoneNumber: contact.phone_number,
            name: unwrapNullString(contact.name),
            groups: unwrapNullString(contact.groups),
            timezone: unwrapNullString(contact.timezone),
            branchCode: unwrapNullString(contact.branch_code),
            ownedByPhoneNumber: contact.owned_by_phone_number,
            isGroup: contact.is_group === 1,
            createdAt: contact.created_at,
            updatedAt: contact.updated_at,
        }
    }

    static collection(contacts: NusawaContactDTO[]) {
        return contacts.map((c) => this.single(c))
    }
}
