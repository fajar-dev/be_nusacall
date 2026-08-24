import { Context } from "hono"
import { ContactService } from "./contact.service"
import { ContactSerializer } from "./serializers/contact.serialize"
import { ApiResponse } from "../../core/helpers/response"
import type { Agent } from "../agent/entities/agent.entity"

export class ContactController {
    constructor(private readonly service: ContactService) {}

    async index(c: Context) {
        const agent = c.get("agent") as Agent
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const search = c.req.query("search") || undefined

        const { data, meta } = await this.service.getAll(agent.username, { page, limit, search })

        return ApiResponse.paginate(c, ContactSerializer.collection(data), meta.total, page, limit)
    }
}
