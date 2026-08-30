import { Context } from "hono"
import { ContactService } from "./contact.service"
import { ContactSerializer } from "./serializers/contact.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { parsePagination } from "../../core/helpers/pagination"

export class ContactController {
    constructor(private readonly service: ContactService) {}

    async index(c: Context) {
        const { page, limit } = parsePagination(c)
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
