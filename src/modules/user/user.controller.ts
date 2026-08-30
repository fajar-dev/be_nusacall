import { Context } from "hono"
import { UserService } from "./user.service"
import { UserSerializer } from "./serializers/user.serialize"
import { ApiResponse } from "../../core/helpers/response"
import type { User } from "./entities/user.entity"
import { parsePagination } from "../../core/helpers/pagination"
import { SortOrder } from "../../core/enums/sort-order.enum"

export class UserController {
    constructor(private readonly service: UserService) {}

    async me(c: Context) {
        const user = c.get("user") as User
        const serialized = await UserSerializer.single(user)
        return ApiResponse.success(c, serialized, "User profile retrieved successfully")
    }

    async available(c: Context) {
        const data = await this.service.getAvailable()
        const serialized = await UserSerializer.collection(data)
        return ApiResponse.success(c, serialized, "Available users retrieved successfully")
    }

    async options(c: Context) {
        const q = c.req.query("q") || ""
        const requestedLimit = Number(c.req.query("limit")) || 20
        const limit = Math.min(Math.max(requestedLimit, 1), 50)

        const data = await this.service.searchOptions(q, limit)
        const serialized = await UserSerializer.collection(data)
        return ApiResponse.success(c, serialized, "User options retrieved successfully")
    }

    async index(c: Context) {
        const { page, limit } = parsePagination(c)
        const q = c.req.query("q") || ""
        const isActive = c.req.query("isActive")
        const organizationId = c.req.query("organizationId")
        const sortBy = c.req.query("sortBy") || undefined
        const order = (c.req.query("order") || "DESC").toUpperCase() as SortOrder

        const filters = { isActive, organizationId }
        const { data, total } = await this.service.getAll(page, limit, q, filters, sortBy, order)

        const serialized = await UserSerializer.collection(data)
        return ApiResponse.paginate(c, serialized, total, page, limit, 'Users retrieved successfully')
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const user = await this.service.getById(id)
        const serialized = await UserSerializer.single(user)
        return ApiResponse.success(c, serialized, "User retrieved successfully")
    }

    async store(c: Context) {
        const data = c.req.valid("json" as never)
        const user = await this.service.create(data)
        const serialized = await UserSerializer.single(user)
        return ApiResponse.success(c, serialized, "User created successfully", 201)
    }

    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never)
        const user = await this.service.update(id, data)
        const serialized = await UserSerializer.single(user)
        return ApiResponse.success(c, serialized, "User updated successfully")
    }

    async destroy(c: Context) {
        const id = Number(c.req.param("id"))
        await this.service.delete(id)
        return ApiResponse.success(c, null, "User deleted successfully")
    }
}