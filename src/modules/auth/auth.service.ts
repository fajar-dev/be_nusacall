import { User } from "../user/entities/user.entity"
import { LoginValidator, GoogleLoginValidator } from "./validators/auth.validator"
import { UnauthorizedException, BadRequestException } from "../../core/exceptions/base"
import { comparePassword } from "../../core/helpers/hash"
import { UserService } from "../user/user.service"
import { AuthHelper } from "../../core/helpers/auth"

export class AuthService {
    constructor(
        private readonly userService: UserService,
    ) {}

    async googleLogin(data: GoogleLoginValidator) {
        const payload = await AuthHelper.verifyGoogleCode(data.code)
        let user = await this.userService.getByEmailWithPassword(payload.email!)

        if (!user) {
            throw new BadRequestException("User not registered")
        }

        if (!user.isActive) {
            throw new BadRequestException("Account is inactive")
        }

        const { accessToken, refreshToken } = await AuthHelper.generateTokens(user)
        // Biarkan controller+serializer yang strip sensitive data
        return { user, accessToken, refreshToken }
    }

    async login(data: LoginValidator) {
        const user = await this.userService.getByEmailWithPassword(data.email)
        if (!user) {
            throw new UnauthorizedException("User not registered")
        }

        if (!user.isActive) {
            throw new UnauthorizedException("Account is inactive")
        }

        if (!user.password) {
            throw new UnauthorizedException("Invalid credentials")
        }

        const isValid = await comparePassword(data.password, user.password)
        if (!isValid) {
            throw new UnauthorizedException("Invalid credentials")
        }

        const { accessToken, refreshToken } = await AuthHelper.generateTokens(user)
        // Biarkan controller+serializer yang strip sensitive data
        return { user, accessToken, refreshToken }
    }

    async logout(_user: User) {
        return true
    }
}


