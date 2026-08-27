import { Context } from "hono"
import { ContactService } from "./contact.service"
import { ContactSerializer } from "./serializers/contact.serialize"
import { ApiResponse } from "../../core/helpers/response"

export class ContactController {
    constructor(private readonly service: ContactService) {}

    async index(c: Context) {
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const q = c.req.query("q") || undefined
        const { data, total } = await this.service.getAll(page, limit, q)
        return ApiResponse.paginate(c, ContactSerializer.collection(data), total, page, limit)
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const contact = await this.service.getById(id)
        return ApiResponse.success(c, ContactSerializer.single(contact))
    }
}
