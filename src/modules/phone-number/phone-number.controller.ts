import { Context } from "hono"
import { PhoneNumberService, UpdatePhoneNumberInput } from "./phone-number.service"
import { PhoneNumberSerializer } from "./serializers/phone-number.serialize"
import { ApiResponse } from "../../core/helpers/response"

export class PhoneNumberController {
    constructor(private readonly service: PhoneNumberService) {}

    async index(c: Context) {
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const { data, total } = await this.service.getAll(page, limit)
        return ApiResponse.paginate(c, PhoneNumberSerializer.collection(data), total, page, limit)
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const phoneNumber = await this.service.getById(id)
        return ApiResponse.success(c, PhoneNumberSerializer.single(phoneNumber))
    }

    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never) as UpdatePhoneNumberInput
        const phoneNumber = await this.service.update(id, data)
        return ApiResponse.success(c, PhoneNumberSerializer.single(phoneNumber), "Phone number updated successfully")
    }

    async sync(c: Context) {
        const id = Number(c.req.param("id"))
        const phoneNumber = await this.service.sync(id)
        return ApiResponse.success(c, PhoneNumberSerializer.single(phoneNumber), "Synced to Meta successfully")
    }

    async health(c: Context) {
        const id = Number(c.req.param("id"))
        const health = await this.service.getHealth(id)
        return ApiResponse.success(c, health)
    }
}
