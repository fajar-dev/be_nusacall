import { Context } from "hono"
import { CallService } from "./call.service"
import { CallRecordingService } from "./call-recording.service"
import { CallSerializer } from "./serializers/call.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { CallStatus } from "./enums/call-status.enum"
import { SortOrder } from "../../core/enums/sort-order.enum"
import { BadGatewayException, ForbiddenException } from "../../core/exceptions/base"
import { PermissionStatus } from "../permission/enums/permission-status.enum"
import type { User } from "../user/entities/user.entity"
import { parsePagination } from "../../core/helpers/pagination"

const OUTBOUND_ERROR_MESSAGES: Record<number, string> = {
    138006: "This customer hasn't granted call permission yet — request it first.",
    138009: "Too many permission requests sent to this customer recently — try again later.",
    138012: "Daily limit of 100 business-initiated calls reached — try again tomorrow.",
    138013: "Business-initiated calling isn't available for this phone number.",
    138014: "Calling is temporarily disabled for this number due to low call quality.",
    138015: "This phone number's messaging limit is below the 2000 required for calling.",
    138017: "A permanent call permission already exists — no need to request again.",
}

export class CallController {
    constructor(
        private readonly service: CallService,
        private readonly recordingService: CallRecordingService,
    ) {}

    async index(c: Context) {
        const { page, limit } = parsePagination(c)
        const statusParam = c.req.query("status")
        const sortBy = c.req.query("sortBy") || undefined
        const order = (c.req.query("order") as SortOrder) || SortOrder.DESC

        const { data, total } = await this.service.getAll(
            page,
            limit,
            {
                q: c.req.query("q") || undefined,
                status: statusParam ? (statusParam.split(",") as CallStatus[]) : undefined,
                direction: c.req.query("direction") || undefined,
                userId: c.req.query("userId") ? Number(c.req.query("userId")) : undefined,
                contactId: c.req.query("contactId") ? Number(c.req.query("contactId")) : undefined,
                phoneNumberId: c.req.query("phoneNumberId") || undefined,
                from: c.req.query("from") || undefined,
                to: c.req.query("to") || undefined,
            },
            sortBy,
            order
        )

        return ApiResponse.paginate(c, await CallSerializer.collection(data), total, page, limit)
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const call = await this.service.getById(id)
        return ApiResponse.success(c, await CallSerializer.single(call))
    }

    async stats(c: Context) {
        const stats = await this.service.getStats({
            phoneNumberId: c.req.query("phoneNumberId") || undefined,
            from: c.req.query("from") || undefined,
            to: c.req.query("to") || undefined,
        })
        return ApiResponse.success(c, stats)
    }

    async recording(c: Context) {
        const id = Number(c.req.param("id"))
        const urls = await this.recordingService.getRecordingUrls(id)
        return ApiResponse.success(c, urls)
    }

    async outbound(c: Context) {
        const user = c.get("user") as User
        const data = c.req.valid("json" as never) as { phoneNumberId: string; contactId: number }

        const { permissionService } = await import("../permission/permission.module")
        const { permission } = await permissionService.checkPermission(data.phoneNumberId, data.contactId)
        const hasPermission = permission.status === PermissionStatus.PERMANENT
            || (permission.status === PermissionStatus.TEMPORARY && (!permission.expiresAt || permission.expiresAt > new Date()))
        if (!hasPermission) {
            throw new ForbiddenException("No active call permission for this customer — request permission first")
        }

        const { callSignalingService } = await import("../../gateway/signaling.module")
        try {
            const result = await callSignalingService.initiateOutbound(user.id, user.email, data.phoneNumberId, data.contactId)
            return ApiResponse.success(c, result)
        } catch (err) {
            const code = (err as { context?: { code?: number } })?.context?.code
            if (code && OUTBOUND_ERROR_MESSAGES[code]) {
                throw new BadGatewayException(OUTBOUND_ERROR_MESSAGES[code], { code })
            }
            throw err
        }
    }
}
