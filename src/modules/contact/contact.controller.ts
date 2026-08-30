import { Context } from "hono"
import { ContactService } from "./contact.service"
import { ContactSerializer } from "./serializers/contact.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { parsePagination } from "../../core/helpers/pagination"
import { SortOrder } from "../../core/enums/sort-order.enum"
import { CreateContactValidator, UpdateContactValidator } from "./validators/contact.validator"

export class ContactController {
    constructor(private readonly service: ContactService) {}

    async index(c: Context) {
        const { page, limit } = parsePagination(c)
        const q = c.req.query("q") || undefined
        const branchId = c.req.query("branchId")
        const sortBy = c.req.query("sortBy") || undefined
        const order = (c.req.query("order") || SortOrder.DESC).toUpperCase() as SortOrder

        const { data, total } = await this.service.getAll(page, limit, q, { branchId }, sortBy, order)
        return ApiResponse.paginate(c, ContactSerializer.collection(data), total, page, limit)
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const contact = await this.service.getById(id)
        return ApiResponse.success(c, ContactSerializer.single(contact))
    }

    async store(c: Context) {
        const data = c.req.valid("json" as never) as CreateContactValidator
        const contact = await this.service.create(data)
        return ApiResponse.success(c, ContactSerializer.single(contact), "Contact created successfully", 201)
    }

    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never) as UpdateContactValidator
        const contact = await this.service.update(id, data)
        return ApiResponse.success(c, ContactSerializer.single(contact), "Contact updated successfully")
    }

    async destroy(c: Context) {
        const id = Number(c.req.param("id"))
        await this.service.delete(id)
        return ApiResponse.success(c, null, "Contact deleted successfully")
    }
}
