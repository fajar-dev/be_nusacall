import { nusawaClient } from "../../infrastructure/nusawa/nusawa.client"
import { ContactService } from "./contact.service"
import { ContactController } from "./contact.controller"

const contactService = new ContactService(nusawaClient)

export const contactController = new ContactController(contactService)
