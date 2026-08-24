import { NusawaClient } from "../../infrastructure/nusawa/nusawa.client"
import { AgentService } from "../agent/agent.service"
import { AuthHelper } from "../../core/helpers/auth"
import { config } from "../../config/config"
import { UnauthorizedException, ServiceUnavailableException } from "../../core/exceptions/base"
import { unwrapNullString } from "../../infrastructure/nusawa/nusawa.types"
import { nusawaSessionRegistry } from "../../infrastructure/nusawa/nusawa-session.registry"
import { logger } from "../../core/helpers/logger"
import { Agent } from "../agent/entities/agent.entity"

/**
 * NusaCall does not authenticate anyone itself — it relays the agent's
 * Nusawork email/password to nusawa's own POST /api/login (server-side
 * only, never from the browser), then validates the resulting session
 * (GET /api/me) and issues its own JWT. See docs/INTEGRATION-NUSAWA.md
 * §2.2, §3.2.
 */
export class AuthService {
    constructor(
        private readonly nusawaClient: NusawaClient,
        private readonly agentService: AgentService,
    ) {}

    async login(email: string, password: string): Promise<{ agent: Agent; accessToken: string; expiresIn: number }> {
        let session: Awaited<ReturnType<NusawaClient["login"]>>
        try {
            session = await this.nusawaClient.login(email, password)
        } catch (err) {
            const statusCode = (err as { statusCode?: number }).statusCode
            if (statusCode === 401) {
                throw new UnauthorizedException("Invalid email or password")
            }
            logger.error("nusawa is unreachable during login", { err })
            throw new ServiceUnavailableException("Identity provider (nusawa) is currently unreachable")
        }

        return this.establishSession(session)
    }

    /**
     * Google Identity Services ID token in, NusaCall session out. nusawa
     * verifies the ID token itself (issuer, audience, signature, expiry) —
     * we never touch Google's APIs directly, same trust boundary as the
     * password path. See docs/INTEGRATION-NUSAWA.md §2.2.
     */
    async loginWithGoogle(idToken: string): Promise<{ agent: Agent; accessToken: string; expiresIn: number }> {
        let session: Awaited<ReturnType<NusawaClient["loginWithGoogle"]>>
        try {
            session = await this.nusawaClient.loginWithGoogle(idToken)
        } catch (err) {
            const statusCode = (err as { statusCode?: number }).statusCode
            if (statusCode === 401) {
                throw new UnauthorizedException("Invalid Google sign-in")
            }
            logger.error("nusawa is unreachable during Google login", { err })
            throw new ServiceUnavailableException("Identity provider (nusawa) is currently unreachable")
        }

        return this.establishSession(session)
    }

    private async establishSession(
        session: Awaited<ReturnType<NusawaClient["login"]>>
    ): Promise<{ agent: Agent; accessToken: string; expiresIn: number }> {
        let me: Awaited<ReturnType<NusawaClient["getMe"]>>
        try {
            me = await this.nusawaClient.getMe(session.access_token)
        } catch (err) {
            const statusCode = (err as { statusCode?: number }).statusCode
            if (statusCode === 401) {
                throw new UnauthorizedException("Invalid or expired nusawa session")
            }
            logger.error("nusawa is unreachable during login", { err })
            throw new ServiceUnavailableException("Identity provider (nusawa) is currently unreachable")
        }

        if (me.status !== "active") {
            throw new UnauthorizedException("User is inactive")
        }

        // Cached so ContactService can call nusawa's agent-gated
        // GET /api/contacts later without re-asking for a password.
        // See docs/INTEGRATION-NUSAWA.md §3.6.
        nusawaSessionRegistry.set(me.username, session.access_token, session.expires_in)

        const agent = await this.agentService.upsert({
            username: me.username,
            displayName: unwrapNullString(me.name) ?? me.username,
            role: me.role,
        })

        if (!agent.canReceiveCalls) {
            // Not a hard auth failure — the agent CAN log in (e.g. to view
            // history), just isn't eligible for the softphone. The frontend
            // decides what to do with `user.canReceiveCalls`.
            logger.info("Agent logged in without call-receiving eligibility", { username: agent.username })
        }

        const accessToken = await AuthHelper.signAgentToken(agent)
        return { agent, accessToken, expiresIn: config.app.jwtExpiresInSeconds }
    }
}
