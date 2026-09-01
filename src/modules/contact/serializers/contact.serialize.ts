import { Contact } from "../entities/contact.entity"

export class ContactSerializer {
    static single(contact: Contact) {
        return {
            id: contact.id,
            phoneNumber: contact.phoneNumber,
            name: contact.name ?? null,
            timeZone: contact.timeZone,
            branches: (contact.branches ?? []).map((branch) => ({ id: branch.id, name: branch.name, code: branch.code })),
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
        }
    }

    static collection(contacts: Contact[]) {
        return contacts.map((c) => this.single(c))
    }
}
