import { Context } from "hono"
import { CallService } from "./call.service"
import { CallRecordingService } from "./call-recording.service"
import { CallSignalingService } from "./call-signaling.service"
import { CallSerializer } from "./serializers/call.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { CallStatus } from "./enums/call-status.enum"
import { SortOrder } from "../../core/enums/sort-order.enum"
import type { User } from "../user/entities/user.entity"
import { parsePagination } from "../../core/helpers/pagination"

export class CallController {
    constructor(
        private readonly service: CallService,
        private readonly recordingService: CallRecordingService,
        private readonly signalingService: CallSignalingService,
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
        const result = await this.signalingService.initiateOutbound(user.id, user.email, data.phoneNumberId, data.contactId)
        return ApiResponse.success(c, result)
    }
}
