import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AppDataSource } from './config/database'
import { serveStatic, websocket } from 'hono/bun'
import { swaggerUI } from '@hono/swagger-ui'
import api from './routes/api'
import { webhookController } from './modules/webhook/webhook.module'
import { signalingGateway } from './gateway/signaling.module'
import { sessionRegistry } from './infrastructure/media/session-registry'
import { startJobs } from './jobs'
import { ApiResponse } from './core/helpers/response'
import { BaseException, ValidationException } from './core/exceptions/base'
import { ZodError } from 'zod'
import { config } from './config/config'
import { logger } from './core/helpers/logger'
import { requestLogger } from './core/middlewares/logger.middleware'
import { languageMiddleware } from './core/middlewares/language.middleware'

const app = new Hono()

app.use('*', requestLogger)
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))
app.use('*', languageMiddleware)

AppDataSource.initialize()
    .then(() => {
        logger.info('Database connected successfully')
        startJobs()
    })
    .catch((err) => logger.error('Database connection failed', { err }))

app.get('/health', async (c) => {
    const dbConnected = AppDataSource.isInitialized
    const status = dbConnected ? 'healthy' : 'unhealthy'
    const statusCode = dbConnected ? 200 : 503

    return c.json({
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.app.env,
        checks: {
            database: dbConnected ? 'connected' : 'disconnected',
        },
        media: {
            activeSessions: sessionRegistry.activeCount,
        },
    }, statusCode)
})

/** Closes active media sessions before a rolling restart — a bare restart would drop every active call. */
app.post('/internal/drain', async (c) => {
    await sessionRegistry.closeAll('drain_requested')
    return c.json({ drained: true, remainingSessions: sessionRegistry.activeCount })
})

/** Mounted outside /api and authMiddleware — auth here is the Meta signature check inside the controller. */
app.get('/wh', (c) => webhookController.verify(c))
app.post('/wh', (c) => webhookController.receive(c))

/** Softphone signaling — auth via `?token=` query string. */
app.get('/ws', signalingGateway.handler())

app.route('/api', api)

app.get('/api/swagger.yaml', serveStatic({ path: './swagger.yaml' }))
app.get('/api/docs', swaggerUI({ url: '/api/swagger.yaml' }))

app.onError((err, c) => {
    const context = { requestId: c.get('requestId'), method: c.req.method, path: c.req.path }

    if (err instanceof ZodError) {
        const valErr = new ValidationException(err)
        logger.warn('Validation error', { ...context, statusCode: valErr.status, err: valErr })
        return ApiResponse.error(c, valErr.message, valErr.status, valErr.context)
    }

    if (err instanceof BaseException) {
        logger.warn('Handled exception', { ...context, statusCode: err.status, err })
        return ApiResponse.error(c, err.message, err.status, err.context)
    }

    logger.error('Unhandled exception', { ...context, statusCode: 500, err })

    const errors = config.app.isProduction ? null : {
        message: err.message,
        stack: err.stack
    }

    return ApiResponse.error(c, "Internal Server Error", 500, errors)
})

export default {
  port: config.app.port,
  fetch: app.fetch,
  websocket,
};
