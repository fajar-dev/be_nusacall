import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"
import { BadGatewayException } from "../../core/exceptions/base"
import type {
    MetaCallActionRequest,
    MetaCallActionResponse,
    MetaErrorResponse,
    MetaCallPermissionResponse,
    MetaCallSettings,
    MetaHealthStatusResponse,
    MetaSendTemplateRequest,
    MetaSendMessageResponse,
} from "./meta.types"

/**
 * Thin wrapper around the WhatsApp Business Calling Graph API — knows nothing
 * about Call/CallEvent entities; orchestration lives in the call/media modules.
 */
export class MetaClient {
    private baseUrl(): string {
        return `${config.meta.graphBaseUrl}/${config.meta.graphVersion}`
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        const url = `${this.baseUrl()}${path}`
        let res: Response
        try {
            res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${config.meta.accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            })
        } catch (err) {
            logger.error("Meta Graph API request failed (network)", { url, err })
            throw new BadGatewayException("Failed to reach Meta Graph API")
        }

        const json = await res.json().catch(() => null)

        if (!res.ok) {
            const errBody = json as MetaErrorResponse | null
            logger.error("Meta Graph API returned an error", {
                url, status: res.status, code: errBody?.error?.code, message: errBody?.error?.message,
            })
            throw new BadGatewayException(
                errBody?.error?.message || `Meta Graph API error (HTTP ${res.status})`,
                { code: errBody?.error?.code, fbtraceId: errBody?.error?.fbtrace_id }
            )
        }

        return json as T
    }

    private async get<T>(path: string): Promise<T> {
        const url = `${this.baseUrl()}${path}`
        let res: Response
        try {
            res = await fetch(url, {
                headers: { Authorization: `Bearer ${config.meta.accessToken}` },
            })
        } catch (err) {
            logger.error("Meta Graph API request failed (network)", { url, err })
            throw new BadGatewayException("Failed to reach Meta Graph API")
        }

        const json = await res.json().catch(() => null)

        if (!res.ok) {
            const errBody = json as MetaErrorResponse | null
            logger.error("Meta Graph API returned an error", {
                url, status: res.status, code: errBody?.error?.code, message: errBody?.error?.message,
            })
            throw new BadGatewayException(
                errBody?.error?.message || `Meta Graph API error (HTTP ${res.status})`,
                { code: errBody?.error?.code, fbtraceId: errBody?.error?.fbtrace_id }
            )
        }

        return json as T
    }

    /** Pre-accepts an inbound call (UIC), establishing the media connection ahead of the agent actually answering. */
    async preAccept(phoneNumberId: string, callId: string, answerSdp: string): Promise<MetaCallActionResponse> {
        const body: MetaCallActionRequest = {
            messaging_product: "whatsapp",
            call_id: callId,
            action: "pre_accept",
            session: { sdp_type: "answer", sdp: answerSdp },
        }
        return this.post(`/${phoneNumberId}/calls`, body)
    }

    /**
     * `answerSdp` MUST be byte-identical to what was sent in preAccept — Meta
     * rejects a mismatch. Do NOT flow media until this resolves with success.
     */
    async accept(phoneNumberId: string, callId: string, answerSdp: string, bizOpaqueCallbackData?: string): Promise<MetaCallActionResponse> {
        const body: MetaCallActionRequest = {
            messaging_product: "whatsapp",
            call_id: callId,
            action: "accept",
            session: { sdp_type: "answer", sdp: answerSdp },
            ...(bizOpaqueCallbackData ? { biz_opaque_callback_data: bizOpaqueCallbackData } : {}),
            ...this.recordingFields(),
        }
        return this.post(`/${phoneNumberId}/calls`, body)
    }

    /**
     * Both must be requested per-call — Meta has no account-wide toggle. Omitted
     * entirely when disabled rather than sent as `{status: "DISABLED"}`, since Meta defaults to disabled anyway.
     */
    private recordingFields(): Pick<MetaCallActionRequest, "recording" | "transcription"> {
        const fields: Pick<MetaCallActionRequest, "recording" | "transcription"> = {}
        if (config.recording.recordingEnabled) {
            fields.recording = {
                status: "ENABLED",
                purpose: config.recording.purpose,
                announcement_language: config.recording.announcementLanguage,
            }
        }
        if (config.recording.transcriptionEnabled) {
            fields.transcription = {
                status: "ENABLED",
                purpose: config.recording.purpose,
                announcement_language: config.recording.announcementLanguage,
            }
        }
        return fields
    }

    async reject(phoneNumberId: string, callId: string): Promise<MetaCallActionResponse> {
        const body: MetaCallActionRequest = {
            messaging_product: "whatsapp",
            call_id: callId,
            action: "reject",
        }
        return this.post(`/${phoneNumberId}/calls`, body)
    }

    /** Must be called even if the peer already sent an RTCP BYE — also makes billing more accurate. */
    async terminate(phoneNumberId: string, callId: string): Promise<MetaCallActionResponse> {
        const body: MetaCallActionRequest = {
            messaging_product: "whatsapp",
            call_id: callId,
            action: "terminate",
        }
        return this.post(`/${phoneNumberId}/calls`, body)
    }

    async connect(phoneNumberId: string, to: string, offerSdp: string, bizOpaqueCallbackData?: string): Promise<MetaCallActionResponse> {
        const body: MetaCallActionRequest = {
            messaging_product: "whatsapp",
            to,
            action: "connect",
            session: { sdp_type: "offer", sdp: offerSdp },
            ...(bizOpaqueCallbackData ? { biz_opaque_callback_data: bizOpaqueCallbackData } : {}),
        }
        return this.post(`/${phoneNumberId}/calls`, body)
    }

    /**
     * Messages API (`/messages`), not the Calling API — the one place NusaCall
     * sends a real outbound WhatsApp message. Requires the template to already exist in Meta Business Manager.
     */
    async sendCallPermissionRequest(phoneNumberId: string, waId: string): Promise<MetaSendMessageResponse> {
        const body: MetaSendTemplateRequest = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: waId,
            type: "template",
            template: {
                name: config.outbound.permissionTemplateName,
                language: { code: config.outbound.permissionTemplateLanguage },
            },
        }
        return this.post(`/${phoneNumberId}/messages`, body)
    }

    /** Checks permission status and remaining quota before every outbound call. */
    async getCallPermission(phoneNumberId: string, waId: string): Promise<MetaCallPermissionResponse> {
        const url = `${this.baseUrl()}/${phoneNumberId}/call_permissions?user_wa_id=${encodeURIComponent(waId)}`
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${config.meta.accessToken}` },
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
            const errBody = json as MetaErrorResponse | null
            throw new BadGatewayException(errBody?.error?.message || `Meta Graph API error (HTTP ${res.status})`)
        }
        return json as MetaCallPermissionResponse
    }

    /** Bersifat REPLACE, bukan merge — Meta replaces the full settings object, not a partial merge. */
    async updateCallSettings(phoneNumberId: string, calling: Record<string, unknown>): Promise<{ success: boolean }> {
        return this.post(`/${phoneNumberId}/settings`, { calling })
    }

    async getCallSettings(phoneNumberId: string): Promise<MetaCallSettings> {
        return this.get(`/${phoneNumberId}/settings`)
    }

    async getHealthStatus(phoneNumberId: string): Promise<MetaHealthStatusResponse> {
        return this.get(`/${phoneNumberId}?fields=health_status`)
    }

    /**
     * Refetches a fresh download URL by media id when the webhook's own `url`
     * has expired (recording: 5 min; transcript: short-lived too).
     */
    async getMediaUrl(mediaId: string): Promise<{ url: string; mime_type: string; sha256: string; file_size?: number }> {
        return this.get(`/${mediaId}`)
    }

    /**
     * NOT routed through `baseUrl()`/`post`/`get` — this is a `lookaside.fbsbx.com`
     * asset URL, not a Graph API path, but still needs the same bearer token.
     */
    async downloadMedia(url: string): Promise<Buffer> {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${config.meta.accessToken}` } })
        if (!res.ok) {
            throw new BadGatewayException(`Failed to download media (HTTP ${res.status})`)
        }
        return Buffer.from(await res.arrayBuffer())
    }
}

export const metaClient = new MetaClient()
