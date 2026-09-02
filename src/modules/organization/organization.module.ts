import { OrganizationRepository } from "./repositories/organization.repository"
import { OrganizationService } from "./organization.service"
import { OrganizationController } from "./organization.controller"

const organizationRepository = new OrganizationRepository()
export const organizationService = new OrganizationService(organizationRepository)

export const organizationController = new OrganizationController(organizationService)
