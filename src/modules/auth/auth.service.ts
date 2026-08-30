import { User } from "../user/entities/user.entity"
import {
    LoginValidator,
    RefreshTokenValidator,
    GoogleLoginValidator,
} from "./validators/auth.validator"
import { UnauthorizedException, BadRequestException } from "../../core/exceptions/base"
import { verify } from "hono/jwt"
import { config } from "../../config/config"
import { UserService } from "../user/user.service"
import { AuthHelper } from "../../core/helpers/auth"

export class AuthService {
    constructor(
        private readonly userService: UserService
    ) {}

    async googleLogin(data: GoogleLoginValidator) {
        const payload = await AuthHelper.verifyGoogleCode(data.code)
        let user = await this.userService.getByEmail(payload.email!)

        if (!user) {
            throw new BadRequestException("User not registered")
        }

        if (!user.isActive) {
            throw new BadRequestException("Account is inactive")
        }

        const { accessToken, refreshToken } = await AuthHelper.generateTokens(user)
        return { user, accessToken, refreshToken }
    }


    async refreshToken(data: RefreshTokenValidator) {
        try {
            const decoded = await verify(data.refreshToken, config.app.jwtRefreshSecret, "HS256") as { sub: number }
            const user = await this.userService.getById(decoded.sub)
            const { accessToken, refreshToken } = await AuthHelper.generateTokens(user)

            return { user, accessToken, refreshToken }
        } catch {
            throw new UnauthorizedException("Invalid or expired refresh token")
        }
    }

    async logout(_user: User) {
        return true
    }
}
