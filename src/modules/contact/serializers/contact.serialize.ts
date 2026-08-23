import { Contact } from "../entities/contact.entity"

export class ContactSerializer {
    static single(contact: Contact) {
        return {
            id: contact.id,
            name: contact.name,
            salutation: contact.salutation || null,
            email: contact.email || null,
            phone: contact.phone || null,
            type: contact.type,
            isActive: Boolean(contact.isActive),
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
        }
    }

    static collection(contacts: Contact[]) {
        return contacts.map(c => this.single(c))
    }
}
