import { Context } from "hono"
import { AuthService } from "./auth.service"
import { AuthSerializer } from "./serializers/auth.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { presenceRegistry } from "../agent/presence.registry"
import { nusawaSessionRegistry } from "../../infrastructure/nusawa/nusawa-session.registry"
import type { Agent } from "../agent/entities/agent.entity"

export class AuthController {
    constructor(private readonly service: AuthService) {}

    async login(c: Context) {
        const data = c.req.valid("json" as never) as { email: string; password: string }
        const { agent, accessToken, expiresIn } = await this.service.login(data.email, data.password)
        return ApiResponse.success(c, AuthSerializer.loginResponse(agent, accessToken, expiresIn), "Login successful")
    }

    async loginGoogle(c: Context) {
        const data = c.req.valid("json" as never) as { idToken: string }
        const { agent, accessToken, expiresIn } = await this.service.loginWithGoogle(data.idToken)
        return ApiResponse.success(c, AuthSerializer.loginResponse(agent, accessToken, expiresIn), "Login successful")
    }

    async logout(c: Context) {
        const agent = c.get("agent") as Agent
        // Full presence teardown (closing the WebSocket) happens client-side
        // and via the signaling gateway's disconnect handler (Milestone 1.4).
        // This just clears any availability the agent had set via the REST API.
        presenceRegistry.setAvailability(agent.username, "offline")
        nusawaSessionRegistry.clear(agent.username)
        return ApiResponse.success(c, null, "Logged out successfully")
    }
}
