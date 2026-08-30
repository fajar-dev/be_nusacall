import { Context, Next } from 'hono'
import { verify } from 'hono/jwt'
import { config } from '../../config/config'
import { userRepository } from '../../modules/user/user.module'
import { UnauthorizedException } from '../exceptions/base'
import type { NusaCallJwtPayload } from '../helpers/auth'

export const authMiddleware = async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException("Missing or invalid authorization header")
    }

    const token = authHeader.split(' ')[1]

    try {
        const decoded = await verify(token, config.app.jwtSecret, "HS256") as unknown as NusaCallJwtPayload
        const user = await userRepository.findById(decoded.sub)

        if (!user || !user.isActive) {
            throw new UnauthorizedException("Unauthorized access")
        }

        c.set('user', user)
        await next()
    } catch (error) {
        if (error instanceof UnauthorizedException) throw error
        throw new UnauthorizedException("Invalid or expired token")
    }
}
