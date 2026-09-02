import { Context } from "hono"
import { AuthService } from "./auth.service"
import { NusaworkAuthService } from "./nusawork-auth.service"
import { ApiResponse } from "../../core/helpers/response"
import { AuthSerializer } from "./serializers/auth.serialize"
import { NusaworkAuthSerializer } from "./serializers/nusawork-auth.serialize"
import { BadRequestException } from "../../core/exceptions/base"
import { config } from "../../config/config"

export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly nusaworkAuthService: NusaworkAuthService,
    ) {}

    async nusaworkLogin(c: Context) {
        const body = c.req.valid("json" as never)
        const data = await this.nusaworkAuthService.passwordLogin(body)
        const serializedUser = await AuthSerializer.single(data.user)
        return ApiResponse.success(c, {
            user: serializedUser,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
        }, "Logged in successfully")
    }

    async google(c: Context) {
        const body = c.req.valid("json" as never)
        const data = await this.authService.googleLogin(body)
        const serializedUser = await AuthSerializer.single(data.user)
        return ApiResponse.success(c, {
            user: serializedUser,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken
        }, 'Logged in successfully')
    }

    async refreshToken(c: Context) {
        const body = c.req.valid("json" as never)
        const tokens = await this.authService.refreshToken(body)
        const serializedUser = await AuthSerializer.single(tokens.user)
        return ApiResponse.success(c, {
            user: serializedUser,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        }, "Token refreshed successfully")
    }

    async me(c: Context) {
        const user = c.get("user")
        const serialized = await AuthSerializer.single(user)
        return ApiResponse.success(c, serialized, "User profile retrieved successfully")
    }

    async sipCredentials(c: Context) {
        const user = c.get("user")
        const { agentSipProvisioningService } = await import("../user/agent-sip-provisioning.service")
        const credential = await agentSipProvisioningService.getCredential(user.id)

        return ApiResponse.success(c, {
            username: credential.username,
            password: credential.password,
            wsUrl: config.agentSip.wsUrl,
            domain: config.agentSip.domain,
        }, "SIP credentials retrieved successfully")
    }

    async logout(c: Context) {
        const user = c.get("user")
        await this.authService.logout(user)
        return ApiResponse.success(c, null, "Logged out successfully")
    }

    async generateQrCode(c: Context) {
        const data = await this.nusaworkAuthService.generateQrCode()
        return ApiResponse.success(c, NusaworkAuthSerializer.generate(data), "QR Code generated successfully")
    }

    async qrCodeStatus(c: Context) {
        const token = c.req.param("token")
        if (!token) throw new BadRequestException("QR Code token is required")

        const body = await this.nusaworkAuthService.checkStatus(token)
        const data = NusaworkAuthSerializer.status(body)

        return ApiResponse.success(c, data, body.message || "OK")
    }

    async qrCodeLogin(c: Context) {
        const body = (await c.req.json()) as { panelToken?: string }
        if (!body.panelToken) throw new BadRequestException("Panel token is required")

        const data = await this.nusaworkAuthService.exchangeToken(body.panelToken)
        const serializedUser = await AuthSerializer.single(data.user)
        return ApiResponse.success(c, {
            user: serializedUser,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
        }, "Logged in successfully via QR Code")
    }
}
