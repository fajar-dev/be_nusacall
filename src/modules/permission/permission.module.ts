import { TypeOrmCallPermissionRepository } from "./repositories/call-permission.repository"
import { PermissionService } from "./permission.service"
import { PermissionController } from "./permission.controller"
import { metaClient } from "../../infrastructure/meta/meta.client"
import { nusawaClient } from "../../infrastructure/nusawa/nusawa.client"

const callPermissionRepository = new TypeOrmCallPermissionRepository()
export const permissionService = new PermissionService(callPermissionRepository, metaClient, nusawaClient)
export const permissionController = new PermissionController(permissionService)
