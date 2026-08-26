import { UnauthorizedException } from "../../core/exceptions/base"
import { UserService } from "../user/user.service"
import { AuthHelper } from "../../core/helpers/auth"
import { LoginValidator } from "./validators/auth.validator"
import { nusaworkHelper } from "../../infrastructure/nusawork/nusawork.client"

interface PanelQrCodeResponse {
    qrcode_image: string
    time_out_in_minute?: number
    expired?: string
}

export class NusaworkAuthService {
    constructor(private readonly userService: UserService) {}

    async generateQrCode() {
        const response = await AuthHelper.panelFetch("/api/companies/login/qrcode", {
            headers: { "Accept": "application/json" },
        })
        const body = (await response.json()) as PanelQrCodeResponse

        const token = AuthHelper.extractQrToken(body.qrcode_image)
        const qrCode = await AuthHelper.fetchQrCodeSvg(body.qrcode_image)

        return {
            token,
            qrCode,
            timeoutMinutes: body.time_out_in_minute || 1,
            expired: body.expired ?? "",
        }
    }

    /** Returns the raw user — the controller+serializer strip sensitive fields before the response. */
    async passwordLogin(data: LoginValidator) {
        const user = await this.userService.getByEmail(data.email)
        if (!user) {
            throw new UnauthorizedException("User not registered")
        }

        if (!user.isActive) {
            throw new UnauthorizedException("Account is inactive")
        }

        const isValid = await nusaworkHelper.authLogin(data.email, data.password)
        if (!isValid) {
            throw new UnauthorizedException("Invalid credentials")
        }

        const { accessToken, refreshToken } = await AuthHelper.generateTokens(user)
        return { user, accessToken, refreshToken }
    }

    async checkStatus(token: string): Promise<Record<string, any>> {
        const response = await AuthHelper.panelFetch(`/api/companies/login/qrcode/${token}`, {
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json",
            },
        })
        return (await response.json()) as Record<string, any>
    }

    async exchangeToken(panelToken: string) {
        const email = AuthHelper.decodeEmailFromJwt(panelToken)

        const user = await this.userService.getByEmail(email)
        if (!user) {
            throw new UnauthorizedException("User not registered")
        }

        if (!user.isActive) {
            throw new UnauthorizedException("Account is inactive")
        }

        const { accessToken, refreshToken } = await AuthHelper.generateTokens(user)
        return { user, accessToken, refreshToken }
    }
}