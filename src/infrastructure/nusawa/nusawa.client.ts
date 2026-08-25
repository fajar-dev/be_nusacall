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
 * `login`/`getMe` MAY throw (there's no fallback for "who is this person").
 * Call-path methods added later must never throw — return null or queue instead.
 */
export class NusawaClient {
    /** POST /api/login — exchanges email/password for a nusawa JWT. Throws on failure; caller (AuthService) maps errors to HTTP responses. */
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
     * POST /api/login/google — exchanges a Google ID token (verified by nusawa
     * itself, not us) for a nusawa JWT. Same response shape as `login`.
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

    /** GET /api/me — relays the agent's own nusawa JWT, NOT NusaCall's API key. */
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
     * GET /api/contacts — relays the agent's own nusawa JWT (cached at login by
     * `NusawaSessionRegistry`), since this endpoint is gated behind agent identity, not NusaCall's API key.
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
     * GET /api/inbox/{phone_number_id}/{phone_number} — identifies the caller
     * after a `connect` webhook. Never throws; degrades to null so a missing/slow nusawa never holds up the call.
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
     * GET /api/inbox/{id} — freshest PIC assignment; fetched right before a
     * routing decision and never cached ("paling cepat basi").
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
     * POST /api/messages?no_send=1 — logs a call outcome without sending a real
     * WhatsApp message. `ref` just varies the RequestURI to dodge nusawa's per-URI rate limit; nusawa itself ignores it.
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
