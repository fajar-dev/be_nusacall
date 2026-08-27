import { Context } from "hono"
import { BranchService } from "./branch.service"
import { BranchSerializer } from "./serializers/branch.serialize"
import { ApiResponse } from "../../core/helpers/response"

export class BranchController {
    constructor(private readonly service: BranchService) {}

    async index(c: Context) {
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const q = c.req.query("q") || ""
        const sortBy = c.req.query("sortBy") || undefined
        const order = (c.req.query("order") || "DESC").toUpperCase() as 'ASC' | 'DESC'

        const { data, total } = await this.service.getAll(page, limit, q, sortBy, order)

        return ApiResponse.paginate(c, BranchSerializer.collection(data), total, page, limit, "Branches retrieved successfully")
    }

    async list(c: Context) {
        const data = await this.service.getList()
        return ApiResponse.success(c, BranchSerializer.listCollection(data), "Branches retrieved successfully")
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const branch = await this.service.getById(id)
        return ApiResponse.success(c, BranchSerializer.single(branch), "Branch retrieved successfully")
    }

    async store(c: Context) {
        const data = c.req.valid("json" as never)
        const branch = await this.service.create(data)
        return ApiResponse.success(c, BranchSerializer.single(branch), "Branch created successfully", 201)
    }

    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never)
        const branch = await this.service.update(id, data)
        return ApiResponse.success(c, BranchSerializer.single(branch), "Branch updated successfully")
    }

    async destroy(c: Context) {
        const id = Number(c.req.param("id"))
        await this.service.delete(id)
        return ApiResponse.success(c, null, "Branch deleted successfully")
    }
}
