import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"
import {
    NusawaContactsResponse,
    NusawaInboxByContactResponse,
    NusawaInboxDTO,
    NusawaInboxDetailResponse,
    NusawaLoginResponse,
    NusawaMeResponse,
} from "./nusawa.types"

/**
 * HTTP client for the nusawa API — a small, deliberate surface
 * (docs/INTEGRATION-NUSAWA.md §1, §3.1). Only called server-side; the
 * browser never talks to nusawa directly.
 *
 * `login`/`getMe` sit on the login path and MAY throw (503 if nusawa is
 * down — there's no fallback for "who is this person"). Call-path methods
 * added later must never throw; return null or queue instead.
 */
export class NusawaClient {
    /**
     * POST /api/login — exchanges the agent's Nusawork email/password for a
     * nusawa JWT. Called server-side only; the plaintext password never
     * leaves this process. Throws on any failure; the caller (AuthService)
     * is responsible for turning that into the right HTTP response.
     */
    async login(email: string, password: string): Promise<NusawaLoginResponse> {
        const url = `${config.nusawa.baseUrl}/api/login`
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            signal: AbortSignal.timeout(config.nusawa.lookupTimeoutMs),
        }).catch((err) => {
            logger.error("nusawa login request failed (network)", { url, err })
            throw err
        })

        if (res.status === 401 || res.status === 422) {
            throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 })
        }
        if (!res.ok) {
            throw Object.assign(new Error(`nusawa login returned HTTP ${res.status}`), { statusCode: 502 })
        }

        return (await res.json()) as NusawaLoginResponse
    }

    /**
     * POST /api/login/google — exchanges a Google Identity Services ID
     * token (verified by nusawa itself, not us) for a nusawa JWT. Same
     * response shape as `login`. Throws on any failure; the caller
     * (AuthService) is responsible for turning that into the right HTTP
     * response.
     */
    async loginWithGoogle(idToken: string): Promise<NusawaLoginResponse> {
        const url = `${config.nusawa.baseUrl}/api/login/google`
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_token: idToken }),
            signal: AbortSignal.timeout(config.nusawa.lookupTimeoutMs),
        }).catch((err) => {
            logger.error("nusawa loginWithGoogle request failed (network)", { url, err })
            throw err
        })

        if (res.status === 401 || res.status === 422) {
            throw Object.assign(new Error("Invalid Google ID token"), { statusCode: 401 })
        }
        if (!res.ok) {
            throw Object.assign(new Error(`nusawa loginWithGoogle returned HTTP ${res.status}`), { statusCode: 502 })
        }

        return (await res.json()) as NusawaLoginResponse
    }

    /**
     * GET /api/me — relays the agent's own nusawa JWT (NOT NusaCall's API
     * key). Throws on any failure; the caller (AuthService) is responsible
     * for turning that into the right HTTP response.
     */
    async getMe(nusawaToken: string): Promise<NusawaMeResponse> {
        const url = `${config.nusawa.baseUrl}/api/me`
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${nusawaToken}` },
            signal: AbortSignal.timeout(config.nusawa.lookupTimeoutMs),
        }).catch((err) => {
            logger.error("nusawa getMe request failed (network)", { url, err })
            throw err
        })

        if (res.status === 401) {
            throw Object.assign(new Error("Invalid or expired nusawa token"), { statusCode: 401 })
        }
        if (!res.ok) {
            throw Object.assign(new Error(`nusawa getMe returned HTTP ${res.status}`), { statusCode: 502 })
        }

        return (await res.json()) as NusawaMeResponse
    }

    /**
     * GET /api/contacts — relays the agent's own nusawa JWT (cached at login
     * time by `NusawaSessionRegistry`, since this endpoint is gated behind
     * agent identity on nusawa's side, not NusaCall's API key). Throws on
     * any failure; the caller (ContactService) is responsible for turning
     * that into the right HTTP response.
     */
    async listContacts(
        nusawaToken: string,
        params: { page: number; limit: number; search?: string }
    ): Promise<NusawaContactsResponse> {
        const query = new URLSearchParams({
            page: String(params.page),
            limit: String(params.limit),
        })
        if (params.search) query.set("search", params.search)

        const url = `${config.nusawa.baseUrl}/api/contacts?${query.toString()}`
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${nusawaToken}` },
            signal: AbortSignal.timeout(config.nusawa.lookupTimeoutMs),
        }).catch((err) => {
            logger.error("nusawa listContacts request failed (network)", { url, err })
            throw err
        })

        if (res.status === 401) {
            throw Object.assign(new Error("Invalid or expired nusawa session"), { statusCode: 401 })
        }
        if (!res.ok) {
            throw Object.assign(new Error(`nusawa listContacts returned HTTP ${res.status}`), { statusCode: 502 })
        }

        return (await res.json()) as NusawaContactsResponse
    }

    /**
     * GET /api/inbox/{phone_number_id}/{phone_number} — identifies the
     * caller right after a `connect` webhook (docs/INTEGRATION-NUSAWA.md
     * §3.3). Call-path method: never throws, degrades to null on any
     * failure so a missing/slow nusawa never holds up the call.
     */
    async findInboxByContact(phoneNumberId: string, phoneNumber: string): Promise<NusawaInboxDTO | null> {
        const url = `${config.nusawa.baseUrl}/api/inbox/${encodeURIComponent(phoneNumberId)}/${encodeURIComponent(phoneNumber)}?limit=1`
        try {
            const res = await fetch(url, {
                headers: { "x-api-key": config.nusawa.apiKey },
                signal: AbortSignal.timeout(config.nusawa.lookupTimeoutMs),
            })
            if (!res.ok) return null
            const body = (await res.json()) as NusawaInboxByContactResponse
            return body.data[0] ?? null
        } catch (err) {
            logger.warn("nusawa findInboxByContact failed — degrading gracefully", { url, err })
            return null
        }
    }

    /**
     * GET /api/inbox/{id} — the freshest PIC assignment, fetched right
     * before a routing decision (docs/INTEGRATION-NUSAWA.md §3.4: "paling
     * cepat basi", never cache). Call-path method: never throws.
     */
    async getInboxDetail(inboxId: number): Promise<NusawaInboxDTO | null> {
        const url = `${config.nusawa.baseUrl}/api/inbox/${inboxId}`
        try {
            const res = await fetch(url, {
                headers: { "x-api-key": config.nusawa.apiKey },
                signal: AbortSignal.timeout(config.nusawa.lookupTimeoutMs),
            })
            if (!res.ok) return null
            const body = (await res.json()) as NusawaInboxDetailResponse
            return body.data
        } catch (err) {
            logger.warn("nusawa getInboxDetail failed — degrading gracefully", { url, err })
            return null
        }
    }

    /**
     * POST /api/messages?no_send=1 — logs a call outcome into the nusawa
     * thread without sending a real WhatsApp message (docs/INTEGRATION-
     * NUSAWA.md §3.5). `ref` just varies the RequestURI to dodge nusawa's
     * per-URI rate limit; nusawa itself ignores it. Call-path method: never
     * throws — the caller (NusawaLogService) owns retry/backoff.
     */
    async logCallMessage(params: { phoneNumberId: string; wacid: string; to: string; body: string }): Promise<boolean> {
        const query = new URLSearchParams({ no_send: "1", phone_number_id: params.phoneNumberId, ref: params.wacid })
        const url = `${config.nusawa.baseUrl}/api/messages?${query.toString()}`
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "x-api-key": config.nusawa.apiKey, "Content-Type": "application/json" },
                body: JSON.stringify({ to: params.to, id: params.wacid, type: "text", text: { body: params.body } }),
                signal: AbortSignal.timeout(config.nusawa.lookupTimeoutMs),
            })
            return res.ok
        } catch (err) {
            logger.warn("nusawa logCallMessage failed", { url, err })
            return false
        }
    }
}

export const nusawaClient = new NusawaClient()
