import { Context } from "hono"
import { UserService } from "./user.service"
import { UserSerializer } from "./serializers/user.serialize"
import { ApiResponse } from "../../core/helpers/response"

export class UserController {
    constructor(private readonly service: UserService) {}

    async index(c: Context) {
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const q = c.req.query("q") || ""
        const isActive = c.req.query("isActive")
        const sortBy = c.req.query("sortBy") || undefined
        const order = c.req.query("order")?.toUpperCase() === "ASC" ? "ASC" : "DESC"

        const filters = { isActive }
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
