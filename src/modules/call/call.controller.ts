import { Context } from "hono"
import { CallService } from "./call.service"
import { CallRecordingService } from "./call-recording.service"
import { CallSerializer } from "./serializers/call.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { CallStatus } from "./enum/call-status.enum"
import { SortOrder } from "../../core/interfaces/base.repository.interface"
import { BadGatewayException, ForbiddenException } from "../../core/exceptions/base"
import { PermissionStatus } from "../permission/enum/permission-status.enum"
import type { User } from "../user/entities/user.entity"

/** docs/ROADMAP.md Fase 3 — full table sourced from Meta's Calling API troubleshooting docs. */
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
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const statusParam = c.req.query("status")
        const sortBy = c.req.query("sortBy") || undefined
        const order = (c.req.query("order") as SortOrder) || "DESC"

        const { data, total } = await this.service.getAll(
            page,
            limit,
            {
                q: c.req.query("q") || undefined,
                status: statusParam ? (statusParam.split(",") as CallStatus[]) : undefined,
                direction: c.req.query("direction") || undefined,
                agentEmail: c.req.query("agentEmail") || undefined,
                phoneNumberId: c.req.query("phoneNumberId") || undefined,
                from: c.req.query("from") || undefined,
                to: c.req.query("to") || undefined,
            },
            sortBy,
            order
        )

        return ApiResponse.paginate(c, CallSerializer.collection(data), total, page, limit)
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const call = await this.service.getById(id)
        return ApiResponse.success(c, CallSerializer.single(call))
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
        const url = await this.recordingService.getRecordingUrl(id)
        return ApiResponse.success(c, { url })
    }

    /**
     * POST /api/call/outbound (Fase 3). Dynamic imports avoid a circular
     * import — call.module.ts (this controller's home) is imported BY
     * gateway/signaling.module.ts, so importing callSignalingService back
     * at module-load time would cycle; resolving it at call-time doesn't.
     * Same pattern already used for /proxy and /upload in routes/api.ts.
     */
    async outbound(c: Context) {
        const user = c.get("user") as User
        const data = c.req.valid("json" as never) as { phoneNumberId: string; waId: string; offerSdp: string }

        const { permissionService } = await import("../permission/permission.module")
        const { permission } = await permissionService.checkPermission(data.phoneNumberId, data.waId)
        const hasPermission = permission.status === PermissionStatus.PERMANENT
            || (permission.status === PermissionStatus.TEMPORARY && (!permission.expiresAt || permission.expiresAt > new Date()))
        if (!hasPermission) {
            throw new ForbiddenException("No active call permission for this customer — request permission first")
        }

        const { callSignalingService } = await import("../../gateway/signaling.module")
        try {
            const result = await callSignalingService.initiateOutbound(user.email, data.phoneNumberId, data.waId, data.offerSdp)
            return ApiResponse.success(c, result)
        } catch (err) {
            const code = (err as { context?: { code?: number } })?.context?.code
            if (code && OUTBOUND_ERROR_MESSAGES[code]) {
                throw new BadGatewayException(OUTBOUND_ERROR_MESSAGES[code], { code })
            }
            throw err
        }
    }

    async transcript(c: Context) {
        const id = Number(c.req.param("id"))
        const content = await this.recordingService.getTranscriptContent(id)
        return ApiResponse.success(c, content)
    }
}
