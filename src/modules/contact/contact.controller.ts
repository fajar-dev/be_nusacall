import { Context } from "hono"
import { ContactService } from "./contact.service"
import { ContactSerializer } from "./serializers/contact.serialize"
import { ApiResponse } from "../../core/helpers/response"

export class ContactController {
    constructor(private readonly service: ContactService) {}

    async index(c: Context) {
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const q = c.req.query("q") || ""
        const sortBy = c.req.query("sortBy") || undefined
        const order = c.req.query("order")?.toUpperCase() === "ASC" ? "ASC" : "DESC"

        const { data, total } = await this.service.getAll(page, limit, q, sortBy, order)

        return ApiResponse.paginate(c, ContactSerializer.collection(data), total, page, limit, 'Contacts retrieved successfully')
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const contact = await this.service.getById(id)
        return ApiResponse.success(c, ContactSerializer.single(contact), "Contact retrieved successfully")
    }

    async store(c: Context) {
        const data = c.req.valid("json" as never)
        const contact = await this.service.create(data)
        return ApiResponse.success(c, ContactSerializer.single(contact), "Contact created successfully", 201)
    }

    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never)
        const contact = await this.service.update(id, data)
        return ApiResponse.success(c, ContactSerializer.single(contact), "Contact updated successfully")
    }

    async destroy(c: Context) {
        const id = Number(c.req.param("id"))
        await this.service.delete(id)
        return ApiResponse.success(c, null, "Contact deleted successfully")
    }
}
