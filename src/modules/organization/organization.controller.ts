import { Context } from "hono"
import { OrganizationService } from "./organization.service"
import { OrganizationSerializer } from "./serializers/organization.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { parsePagination } from "../../core/helpers/pagination"
import { SortOrder } from "../../core/enums/sort-order.enum"

export class OrganizationController {
    constructor(private readonly service: OrganizationService) {}

    async index(c: Context) {
        const { page, limit } = parsePagination(c)
        const q = c.req.query("q") || ""
        const sortBy = c.req.query("sortBy") || undefined
        const order = (c.req.query("order") || "DESC").toUpperCase() as SortOrder

        const { data, total } = await this.service.getAll(page, limit, q, sortBy, order)

        return ApiResponse.paginate(c, OrganizationSerializer.collection(data), total, page, limit, "Organizations retrieved successfully")
    }

    async list(c: Context) {
        const data = await this.service.getList()
        return ApiResponse.success(c, OrganizationSerializer.listCollection(data), "Organizations retrieved successfully")
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const org = await this.service.getById(id)
        return ApiResponse.success(c, OrganizationSerializer.single(org), "Organization retrieved successfully")
    }

    async store(c: Context) {
        const data = c.req.valid("json" as never)
        const org = await this.service.create(data)
        return ApiResponse.success(c, OrganizationSerializer.single(org), "Organization created successfully", 201)
    }

    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never)
        const org = await this.service.update(id, data)
        return ApiResponse.success(c, OrganizationSerializer.single(org), "Organization updated successfully")
    }

    async destroy(c: Context) {
        const id = Number(c.req.param("id"))
        await this.service.delete(id)
        return ApiResponse.success(c, null, "Organization deleted successfully")
    }
}
