import { TypeOrmPhoneNumberRepository } from "./repositories/phone-number.repository"
import { PhoneNumberService } from "./phone-number.service"
import { PhoneNumberController } from "./phone-number.controller"
import { metaClient } from "../../infrastructure/meta/meta.client"

export const phoneNumberRepository = new TypeOrmPhoneNumberRepository()
export const phoneNumberService = new PhoneNumberService(phoneNumberRepository, metaClient)
export const phoneNumberController = new PhoneNumberController(phoneNumberService)
