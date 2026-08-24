/**
 * All environment variables, centralized. JWT secrets are required in
 * production; DB_SYNC is force-disabled there to prevent data loss.
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
        name: process.env.APP_NAME || 'nusacall',
        port: Number(process.env.PORT) || 4100,
        appUrl: process.env.APP_URL || 'http://localhost:4100',
        env,
        isProduction,
        jwtSecret: requireEnv('JWT_SECRET', isProduction ? undefined : 'dev-jwt-secret-change-me'),
        jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN) || 28800, // 8 jam
        apiKey: requireEnv('API_KEY', isProduction ? undefined : 'dev-api-key-change-me'),
    },
    database: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        pass: process.env.DB_PASS || '',
        name: process.env.DB_NAME || 'nusacall',
        // SAFETY: synchronize SELALU false di production (gunakan migrations)
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

    // ── Meta WhatsApp Business Calling API ──────────────────────────────
    meta: {
        appId: requireEnv('META_APP_ID'),
        appSecret: requireEnv('META_APP_SECRET'),
        verifyToken: requireEnv('META_VERIFY_TOKEN'),
        accessToken: requireEnv('META_ACCESS_TOKEN'),
        graphVersion: process.env.META_GRAPH_VERSION || 'v26.0',
        graphBaseUrl: process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com',
    },

    // ── NusaWA (nusawachannel-backend) ───────────────────────────────────
    nusawa: {
        baseUrl: requireEnv('NUSAWA_BASE_URL', 'http://localhost:9001'),
        apiKey: requireEnv('NUSAWA_API_KEY'),
        webUrl: process.env.NUSAWA_WEB_URL || '',
        lookupTimeoutMs: Number(process.env.NUSAWA_LOOKUP_TIMEOUT_MS) || 2000,
        meCacheTtlSeconds: Number(process.env.NUSAWA_ME_CACHE_TTL) || 60,
        contactCacheTtlSeconds: Number(process.env.NUSAWA_CONTACT_CACHE_TTL) || 30,
    },

    // ── Siklus hidup panggilan ────────────────────────────────────────────
    call: {
        answerTimeoutSeconds: Number(process.env.CALL_ANSWER_TIMEOUT) || 20,
        webhookStaleSeconds: Number(process.env.WEBHOOK_STALE_SECONDS) || 120,
        reconcileAfterMinutes: Number(process.env.CALL_RECONCILE_AFTER_MINUTES) || 30,
    },

    // ── Media plane (WebRTC) ─────────────────────────────────────────────
    media: {
        iceGatheringTimeoutMs: Number(process.env.ICE_GATHERING_TIMEOUT_MS) || 3000,
        sessionMaxDurationMinutes: Number(process.env.MEDIA_SESSION_MAX_MINUTES) || 240,
        publicIp: process.env.MEDIA_PUBLIC_IP || '',
        udpPortMin: Number(process.env.MEDIA_UDP_PORT_MIN) || 40000,
        udpPortMax: Number(process.env.MEDIA_UDP_PORT_MAX) || 40100,
    },

    // ── Rekaman & transkrip panggilan (Fase 2) ────────────────────────────
    recording: {
        // Both must be requested per-call on the `accept` request (Meta has
        // no account-wide toggle) — see docs/INTEGRATION-META.md §7.
        recordingEnabled: process.env.CALL_RECORDING_ENABLED === 'true',
        transcriptionEnabled: process.env.CALL_TRANSCRIPTION_ENABLED === 'true',
        // Spoken to both parties before recording/transcription starts.
        purpose: process.env.CALL_RECORDING_PURPOSE || 'quality assurance',
        // Meta's documented example uses en_US; verify locale support before
        // switching (docs/ROADMAP.md Fase 2 risk: "announcement tidak ada
        // Bahasa Indonesia").
        announcementLanguage: process.env.CALL_RECORDING_ANNOUNCEMENT_LANGUAGE || 'en_US',
        // Meta deletes the media 7 days after the *_available webhook fires
        // — this is fixed by Meta, not configurable.
        metaRetentionDays: 7,
        downloadJobIntervalMinutes: Number(process.env.RECORDING_DOWNLOAD_INTERVAL_MINUTES) || 5,
    },

    // ── Panggilan keluar (Fase 3) ──────────────────────────────────────────
    outbound: {
        // A VOICE_CALL_REQUEST-category template — this specific category
        // needs no Meta approval, but MUST be created in Business Manager
        // first (a UI action, not something this app can do). See
        // docs/ROADMAP.md Fase 3.
        permissionTemplateName: process.env.CALL_PERMISSION_TEMPLATE_NAME || '',
        permissionTemplateLanguage: process.env.CALL_PERMISSION_TEMPLATE_LANGUAGE || 'en_US',
        // Our own cache TTL ahead of Meta's own rate limit on the check
        // endpoint itself (error 613).
        permissionCacheTtlSeconds: Number(process.env.CALL_PERMISSION_CACHE_TTL) || 60,
    },
}
