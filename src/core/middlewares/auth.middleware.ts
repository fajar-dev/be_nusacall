import { Context, Next } from 'hono'
import { verify } from 'hono/jwt'
import { config } from '../../config/config'
import { AppDataSource } from '../../config/database'
import { Agent } from '../../modules/agent/entities/agent.entity'
import { UnauthorizedException } from '../exceptions/base'
import type { NusaCallJwtPayload } from '../helpers/auth'

/**
 * Verifies a NusaCall-issued JWT (Bearer header) and loads the corresponding
 * Agent by username (JWT `sub`). Used for all authenticated REST endpoints.
 */
export const authMiddleware = async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException("Missing or invalid authorization header")
    }

    const token = authHeader.split(' ')[1]

    try {
        const decoded = await verify(token, config.app.jwtSecret, "HS256") as unknown as NusaCallJwtPayload
        const agentRepository = AppDataSource.getRepository(Agent)
        const agent = await agentRepository.findOne({ where: { username: decoded.sub } })

        if (!agent) {
            throw new UnauthorizedException("Unauthorized access")
        }

        c.set('agent', agent)
        await next()
    } catch (error) {
        if (error instanceof UnauthorizedException) throw error
        throw new UnauthorizedException("Invalid or expired token")
    }
}
