import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AppDataSource } from './config/database'
import { serveStatic } from 'hono/bun'
import { swaggerUI } from '@hono/swagger-ui'
import api from './routes/api'
import { ApiResponse } from './core/helpers/response'
import { BaseException, ValidationException } from './core/exceptions/base'
import { ZodError } from 'zod'
import { config } from './config/config'
import { logger } from './core/helpers/logger'
import { requestLogger } from './core/middlewares/logger.middleware'
import { languageMiddleware } from './core/middlewares/language.middleware'

const app = new Hono()

// Request Logger
app.use('*', requestLogger)

// CORS
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

// Language Detection (Accept-Language header)
app.use('*', languageMiddleware)

// Database Connection
AppDataSource.initialize()
    .then(() => logger.info('Database connected successfully'))
    .catch((err) => logger.error('Database connection failed', { err }))

// Health Check (untuk load balancer, K8s, monitoring)
app.get('/health', async (c) => {
    const dbConnected = AppDataSource.isInitialized
    const status = dbConnected ? 'healthy' : 'degraded'
    const statusCode = dbConnected ? 200 : 503

    return c.json({
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.app.env,
        checks: {
            database: dbConnected ? 'connected' : 'disconnected',
        }
    }, statusCode)
})

// Application Routes
app.route('/api', api)

// Swagger UI
app.get('/api/swagger.yaml', serveStatic({ path: './swagger.yaml' }))
app.get('/api/docs', swaggerUI({ url: '/api/swagger.yaml' }))

// Global Error Handler
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
};
