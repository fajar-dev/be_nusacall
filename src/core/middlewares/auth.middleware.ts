import { Context, Next } from 'hono'
import { verify } from 'hono/jwt'
import { config } from '../../config/config'
import { AppDataSource } from '../../config/database'
import { User } from '../../modules/user/entities/user.entity'
import { UnauthorizedException } from '../exceptions/base'

export const authMiddleware = async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException("Missing or invalid authorization header")
    }

    const token = authHeader.split(' ')[1]
    
    try {
        const decoded = await verify(token, config.app.jwtSecret, "HS256") as { sub: number }
        const userRepository = AppDataSource.getRepository(User)
        const user = await userRepository.findOne({
            where: { id: decoded.sub },
            select: ["id", "name", "photo", "email", "password", "isActive", "createdAt", "updatedAt"]
        })

        if (!user) {
            throw new UnauthorizedException("Unauthorized access")
        }

        c.set('user', user)
        await next()
    } catch (error) {
        throw new UnauthorizedException("Invalid or expired token")
    }
}
