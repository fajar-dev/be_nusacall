import { Context } from "hono"
import { AccountService, UpdateAccountInput } from "./account.service"
import { AccountSerializer } from "./serializers/account.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { parsePagination } from "../../core/helpers/pagination"

export class AccountController {
    constructor(private readonly service: AccountService) {}

    async index(c: Context) {
        const { page, limit } = parsePagination(c)
        const { data, total } = await this.service.getAll(page, limit)
        return ApiResponse.paginate(c, AccountSerializer.collection(data), total, page, limit)
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const account = await this.service.getById(id)
        return ApiResponse.success(c, AccountSerializer.single(account))
    }

    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never) as UpdateAccountInput
        const account = await this.service.update(id, data)
        return ApiResponse.success(c, AccountSerializer.single(account), "Account updated successfully")
    }

    async sync(c: Context) {
        const id = Number(c.req.param("id"))
        const account = await this.service.sync(id)
        return ApiResponse.success(c, AccountSerializer.single(account), "Synced to Meta successfully")
    }

    async health(c: Context) {
        const id = Number(c.req.param("id"))
        const health = await this.service.getHealth(id)
        return ApiResponse.success(c, health)
    }
}
