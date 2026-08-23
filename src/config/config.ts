/**
 * Global Application Configuration
 * All environment variables are centralized here
 * 
 * PRODUCTION SAFETY:
 * - JWT secrets WAJIB di-set via environment variable di production
 * - DB_SYNC otomatis false di production (mencegah data loss)
 */

const env = process.env.NODE_ENV || 'development'
const isProduction = env === 'production'

/**
 * Validate required env vars in production.
 * Akan crash saat startup jika env penting tidak di-set.
 */
function requireEnv(key: string, defaultValue?: string): string {
    const value = process.env[key] || defaultValue
    if (!value && isProduction) {
        throw new Error(`[CONFIG] Missing required environment variable: ${key}`)
    }
    return value || ''
}

export const config = {
    app: {
        name: process.env.APP_NAME || 'hono-be',
        port: Number(process.env.PORT) || 3000,
        appUrl: process.env.APP_URL || 'http://localhost:4000',
        env,
        isProduction,
        jwtSecret: requireEnv('JWT_SECRET', isProduction ? undefined : 'dev-jwt-secret-change-me'),
        jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET', isProduction ? undefined : 'dev-jwt-refresh-secret-change-me'),
        apiKey: requireEnv('API_KEY', isProduction ? undefined : 'dev-api-key-change-me'),
    },
    database: {
        type: (process.env.DB_TYPE || 'postgres') as 'postgres' | 'mysql',
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'root',
        pass: process.env.DB_PASS || '',
        name: process.env.DB_NAME || 'hono_be',
        // SAFETY: synchronize SELALU false di production (gunakan migrations)
        sync: isProduction ? false : process.env.DB_SYNC === "true",
    },
    mail: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.SMTP_FROM || '"Hono BE" <noreply@example.com>',
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    minio: {
        endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
        port: Number(process.env.MINIO_PORT) || 9000,
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY || '',
        secretKey: process.env.MINIO_SECRET_KEY || '',
        bucket: process.env.MINIO_BUCKET || 'hono-be',
    },
}
