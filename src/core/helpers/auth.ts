import { sign } from "hono/jwt"
import { config } from "../../config/config"
import { Agent } from "../../modules/agent/entities/agent.entity"

/**
 * NusaCall issues its OWN JWTs after validating the agent's identity against
 * nusawa (GET /api/me). It does NOT share JWT_SECRET with nusawa and does NOT
 * store passwords — nusawa remains the sole identity provider.
 * See: docs/INTEGRATION-NUSAWA.md §2.2
 */
export interface NusaCallJwtPayload {
    sub: string // username (agent's email) — the primary key, not a numeric id
    role?: string
    exp: number
    [key: string]: unknown // required by hono/jwt's JWTPayload constraint
}

export class AuthHelper {
    static async signAgentToken(agent: Pick<Agent, "username" | "role">): Promise<string> {
        const payload: NusaCallJwtPayload = {
            sub: agent.username,
            role: agent.role ?? undefined,
            exp: Math.floor(Date.now() / 1000) + config.app.jwtExpiresInSeconds,
        }
        return sign(payload, config.app.jwtSecret, "HS256")
    }
}
