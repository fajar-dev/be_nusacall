import { Context } from "hono"
import { PermissionService } from "./permission.service"
import { ApiResponse } from "../../core/helpers/response"

export class PermissionController {
    constructor(private readonly service: PermissionService) {}

    async check(c: Context) {
        const phoneNumberId = c.req.query("phoneNumberId") ?? ""
        const contactId = Number(c.req.query("contactId"))
        const { permission, quota } = await this.service.checkPermission(phoneNumberId, contactId)
        return ApiResponse.success(c, {
            status: permission.status,
            expiresAt: permission.expiresAt,
            lastRequestedAt: permission.lastRequestedAt,
            quota,
        })
    }

    async request(c: Context) {
        const data = c.req.valid("json" as never) as { phoneNumberId: string; contactId: number }
        await this.service.requestPermission(data.phoneNumberId, data.contactId)
        return ApiResponse.success(c, null, "Permission request sent")
    }
}
