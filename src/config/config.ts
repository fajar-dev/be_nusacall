
const env = process.env.NODE_ENV || 'development'
const isProduction = env === 'production'

export const config = {
    app: {
        name: process.env.APP_NAME || 'nusacall',
        port: Number(process.env.PORT) || 4100,
        appUrl: process.env.APP_URL || 'http://localhost:4100',
        env,
        isProduction,
        jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
        jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret-change-me',
        jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN) || 28800,
    },
    database: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        pass: process.env.DB_PASS || '',
        name: process.env.DB_NAME || 'nusacall',
        sync: isProduction ? false : process.env.DB_SYNC === "true",
    },
    minio: {
        endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
        port: Number(process.env.MINIO_PORT) || 9000,
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY || '',
        secretKey: process.env.MINIO_SECRET_KEY || '',
        bucket: process.env.MINIO_BUCKET || 'nusacall-recordings',
    },

    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },

    nusawork: {
        apiUrl: process.env.NUSAWORK_API_URL || '',
        clientId: process.env.NUSAWORK_CLIENT_ID || '',
        clientSecret: process.env.NUSAWORK_CLIENT_SECRET || '',
        auth: {
            clientId: process.env.NUSAWORK_AUTH_CLIENT_ID || '',
            clientSecret: process.env.NUSAWORK_AUTH_CLIENT_SECRET || '',
        }
    },

    nusawa: {
        baseUrl: process.env.NUSAWA_BASE_URL || 'http://localhost:9001',
        apiKey: process.env.NUSAWA_API_KEY || '',
        lookupTimeoutMs: Number(process.env.NUSAWA_LOOKUP_TIMEOUT_MS) || 2000,
    },

    call: {
        answerTimeoutSeconds: Number(process.env.CALL_ANSWER_TIMEOUT) || 20,
        webhookStaleSeconds: Number(process.env.WEBHOOK_STALE_SECONDS) || 120,
        reconcileAfterMinutes: Number(process.env.CALL_RECONCILE_AFTER_MINUTES) || 30,
    },

    media: {
        iceGatheringTimeoutMs: Number(process.env.ICE_GATHERING_TIMEOUT_MS) || 3000,
        sessionMaxDurationMinutes: Number(process.env.MEDIA_SESSION_MAX_MINUTES) || 240,
        publicIp: process.env.MEDIA_PUBLIC_IP || '',
        udpPortMin: Number(process.env.MEDIA_UDP_PORT_MIN) || 40000,
        udpPortMax: Number(process.env.MEDIA_UDP_PORT_MAX) || 40100,
    },

    recording: {
        recordingEnabled: process.env.CALL_RECORDING_ENABLED === 'true',
        ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    },

    outbound: {
        permissionCacheTtlSeconds: Number(process.env.CALL_PERMISSION_CACHE_TTL) || 60,
    },
}
