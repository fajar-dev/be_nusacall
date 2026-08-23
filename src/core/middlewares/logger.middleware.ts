import { Context, Next } from 'hono'
import { getConnInfo } from 'hono/bun'
import { logger } from '../helpers/logger'

declare module 'hono' {
    interface ContextVariableMap {
        requestId: string
    }
}

function resolveIp(c: Context): string | undefined {
    const forwarded = c.req.header('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()

    try {
        return getConnInfo(c).remote.address
    } catch {
        return undefined
    }
}

export const requestLogger = async (c: Context, next: Next) => {
    const start = Date.now()
    const requestId = c.req.header('x-request-id') || crypto.randomUUID()
    c.set('requestId', requestId)
    c.header('X-Request-Id', requestId)

    await next()

    const durationMs = Date.now() - start
    const statusCode = c.res.status
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'

    logger[level]('HTTP request', {
        requestId,
        method: c.req.method,
        path: c.req.path,
        query: c.req.query(),
        statusCode,
        durationMs,
        ip: resolveIp(c),
        userAgent: c.req.header('user-agent'),
    })
}
