import { Context } from "hono"
import { AuthService } from "./auth.service"
import { ApiResponse } from "../../core/helpers/response"
import { AuthSerializer } from "./serializers/auth.serialize"

export class AuthController {
    constructor(private readonly service: AuthService) {}

    async login(c: Context) {
        const body = c.req.valid("json" as never)
        const data = await this.service.login(body)
        const serializedUser = await AuthSerializer.single(data.user)
        return ApiResponse.success(c, {
            user: serializedUser,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
        }, "Logged in successfully")
    }

    async google(c: Context) {
        const body = c.req.valid("json" as never)
        const data = await this.service.googleLogin(body)
        const serializedUser = await AuthSerializer.single(data.user)
        return ApiResponse.success(c, {
            user: serializedUser,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken
        }, 'Logged in successfully')
    }

    async logout(c: Context) {
        const user = c.get("user")
        await this.service.logout(user)
        return ApiResponse.success(c, null, "Logged out successfully")
    }
}


