import { Context, Next } from 'hono'
import { verify } from 'hono/jwt'
import { config } from '../../config/config'
import { UnauthorizedException } from '../exceptions/base'
import { AppDataSource } from '../../config/database'
import { User } from '../../modules/user/entities/user.entity'

/**
 * Middleware for Receipt Authentication
 * Supports standard Authorization header AND token query parameter
 */
export const tokenAuthMiddleware = async (c: Context, next: Next) => {
    const token = c.req.query('token') || c.req.header('Authorization')?.replace('Bearer ', '')

    if (!token) {
        throw new UnauthorizedException("Authentication token is required")
    }

    try {
        const decoded = await verify(token, config.app.jwtSecret, "HS256") as { sub: number }
        
        const userRepository = AppDataSource.getRepository(User)
        const user = await userRepository.findOneBy({ id: decoded.sub })
        
        if (!user) {
            throw new UnauthorizedException("Unauthorized access")
        }

        c.set('user', user)
        await next()
    } catch (error) {
        throw new UnauthorizedException("Invalid or expired token")
    }
}
