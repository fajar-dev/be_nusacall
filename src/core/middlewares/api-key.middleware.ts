import { Context, Next } from 'hono'
import { config } from '../../config/config'
import { UnauthorizedException } from '../exceptions/base'

/**
 * Middleware for API Key Authentication
 * Verifies x-api-key header against the configured key
 */
export const apiKeyMiddleware = async (c: Context, next: Next) => {
    const apiKey = c.req.header('x-api-key')
    
    if (!apiKey || apiKey !== config.app.apiKey) {
        throw new UnauthorizedException("Missing or invalid API key")
    }

    await next()
}
