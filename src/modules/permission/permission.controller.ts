import { Context } from "hono"
import { PermissionService } from "./permission.service"
import { ApiResponse } from "../../core/helpers/response"

export class PermissionController {
    constructor(private readonly service: PermissionService) {}

    /** GET /api/permission?phoneNumberId=&waId= — status + live quota for the "boleh telepon?" indicator. */
    async check(c: Context) {
        const phoneNumberId = c.req.query("phoneNumberId") ?? ""
        const waId = c.req.query("waId") ?? ""
        const { permission, quota } = await this.service.checkPermission(phoneNumberId, waId)
        return ApiResponse.success(c, {
            status: permission.status,
            expiresAt: permission.expiresAt,
            lastRequestedAt: permission.lastRequestedAt,
            quota,
        })
    }

    /** POST /api/permission/request — sends the VOICE_CALL_REQUEST template. */
    async request(c: Context) {
        const data = c.req.valid("json" as never) as { phoneNumberId: string; waId: string }
        await this.service.requestPermission(data.phoneNumberId, data.waId)
        return ApiResponse.success(c, null, "Permission request sent")
    }
}
