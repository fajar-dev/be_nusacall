import { sign } from "hono/jwt"
import { OAuth2Client } from "google-auth-library"
import { config } from "../../config/config"

export class AuthHelper {
    static async generateTokens(user: any) {
        const accessToken = await sign(
            { 
                sub: user.id, 
                email: user.email, 
                exp: Math.floor(Date.now() / 1000) + 60 * 15 // 15 mins
            }, 
            config.app.jwtSecret,
            "HS256"
        )

        const refreshToken = await sign(
            { 
                sub: user.id, 
                exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
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
}