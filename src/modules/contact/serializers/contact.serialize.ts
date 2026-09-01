import { Contact } from "../entities/contact.entity"

export class ContactSerializer {
    static single(contact: Contact) {
        return {
            id: contact.id,
            phoneNumber: contact.phoneNumber,
            name: contact.name ?? null,
            timeZone: contact.timeZone,
            branches: (contact.contactBranches ?? []).map((cb) => ({ id: cb.branch.id, name: cb.branch.name, code: cb.branch.code })),
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
        }
    }

    static collection(contacts: Contact[]) {
        return contacts.map((c) => this.single(c))
    }
}
