import { Contact } from "../entities/contact.entity"

export class ContactSerializer {
    static single(contact: Contact) {
        return {
            id: contact.id,
            waId: contact.waId,
            profileName: contact.profileName,
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
        }
    }

    static collection(contacts: Contact[]) {
        return contacts.map((c) => this.single(c))
    }
}
