import { Context } from "hono"
import { CallService } from "./call.service"
import { CallRecordingService } from "./call-recording.service"
import { CallSerializer } from "./serializers/call.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { CallStatus } from "./enum/call-status.enum"
import { SortOrder } from "../../core/interfaces/base.repository.interface"

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
                agentUsername: c.req.query("agentUsername") || undefined,
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

    async transcript(c: Context) {
        const id = Number(c.req.param("id"))
        const content = await this.recordingService.getTranscriptContent(id)
        return ApiResponse.success(c, content)
    }
}
