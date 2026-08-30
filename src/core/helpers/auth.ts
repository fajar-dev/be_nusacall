import { sign } from "hono/jwt"
import { OAuth2Client } from "google-auth-library"
import { config } from "../../config/config"
import { BadRequestException } from "../exceptions/base"

const PANEL_BASE_URL = "https://panel.nusawork.com"

export interface NusaCallJwtPayload {
    sub: number
    email: string
    exp: number
}

export class AuthHelper {
    static async generateTokens(user: any) {
        const accessToken = await sign(
            {
                sub: user.id,
                email: user.email,
                exp: Math.floor(Date.now() / 1000) + 60 * 15
            },
            config.app.jwtSecret,
            "HS256"
        )

        const refreshToken = await sign(
            {
                sub: user.id,
                exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
            },
            config.app.jwtRefreshSecret,
            "HS256"
        )

        return { accessToken, refreshToken }
    }

    private static getOauth2Client() {
        const oAuth2Client = new OAuth2Client(
            config.google.clientId,
            config.google.clientSecret,
            'postmessage'
        );
        return oAuth2Client;
    }

    static async verifyGoogleCode(code: string): Promise<any> {
        const oAuth2Client = this.getOauth2Client();
        const result = await oAuth2Client.getToken(code);
        const ticket = await oAuth2Client.verifyIdToken({
            idToken: result.tokens.id_token!,
            audience: config.google.clientId,
        });
        const payload = ticket.getPayload();
        return payload;
    }

    static async verifyGoogleIdToken(idToken: string): Promise<any> {
        const oAuth2Client = this.getOauth2Client();
        const ticket = await oAuth2Client.verifyIdToken({
            idToken,
            audience: config.google.clientId,
        });
        return ticket.getPayload();
    }

    static async panelFetch(path: string, options?: RequestInit): Promise<Response> {
        let response: Response
        try {
            response = await fetch(`${PANEL_BASE_URL}${path}`, options)
        } catch (err: any) {
            throw new BadRequestException(`Failed to connect to panel server: ${err.message || "Unknown error"}`)
        }

        if (!response.ok) {
            if (response.status === 404 || response.status === 410) {
                throw new BadRequestException("QR Code has expired")
            }
            throw new BadRequestException(`Panel server returned ${response.status}`)
        }

        return response
    }

    static extractQrToken(qrCodeImageUrl: string): string {
        const parts = qrCodeImageUrl.split("/api/companies/login/qrcode/")
        const token = parts.length > 1 ? parts[1] : null

        if (!token) {
            throw new BadRequestException("Could not extract QR token from panel response")
        }

        return token
    }

    static async fetchQrCodeSvg(imageUrl: string): Promise<string> {
        try {
            const response = await fetch(imageUrl)
            if (response.ok) {
                const svgText = await response.text()
                return `data:image/svg+xml;base64,${Buffer.from(svgText).toString("base64")}`
            }
        } catch {
        }

        throw new BadRequestException("Failed to load QR Code image from panel")
    }

    static decodeEmailFromJwt(token: string): string {
        try {
            const parts = token.split(".")
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString())
                if (payload.email) return payload.email
            }
        } catch {
        }

        throw new BadRequestException("Could not retrieve user email from panel token")
    }
}