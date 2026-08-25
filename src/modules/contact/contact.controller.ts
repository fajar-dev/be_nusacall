import { Context } from "hono"
import { ContactService } from "./contact.service"
import { ContactSerializer } from "./serializers/contact.serialize"
import { ApiResponse } from "../../core/helpers/response"
import type { User } from "../user/entities/user.entity"

export class ContactController {
    constructor(private readonly service: ContactService) {}

    async index(c: Context) {
        const user = c.get("user") as User
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const search = c.req.query("search") || undefined

        const { data, meta } = await this.service.getAll(user.email, { page, limit, search })

        return ApiResponse.paginate(c, ContactSerializer.collection(data), meta.total, page, limit)
    }
}
