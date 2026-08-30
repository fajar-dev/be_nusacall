import { Contact } from "../entities/contact.entity"

export class ContactSerializer {
    static single(contact: Contact) {
        return {
            id: contact.id,
            phoneNumber: contact.phoneNumber,
            name: contact.name ?? null,
            timeZone: contact.timeZone,
            branch: contact.branch ? { id: contact.branch.id, name: contact.branch.name, code: contact.branch.code } : null,
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
        }
    }

    static collection(contacts: Contact[]) {
        return contacts.map((c) => this.single(c))
    }
}
