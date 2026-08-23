import { TypeOrmContactRepository } from "./repositories/contact.repository"
import { ContactService } from "./contact.service"
import { ContactController } from "./contact.controller"

const contactRepository = new TypeOrmContactRepository()
const contactService = new ContactService(contactRepository)

export const contactController = new ContactController(contactService)
