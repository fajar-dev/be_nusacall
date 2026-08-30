import axios, { AxiosInstance, AxiosResponse } from "axios"
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

export class MetaClient {
    private readonly http: AxiosInstance = axios.create({
        baseURL: `${config.meta.graphBaseUrl}/${config.meta.graphVersion}`,
        headers: { Authorization: `Bearer ${config.meta.accessToken}` },
        validateStatus: () => true,
    })

    private unwrap<T>(path: string, res: AxiosResponse): T {
        if (res.status < 200 || res.status >= 300) {
            const errBody = res.data as MetaErrorResponse | null
            logger.error("Meta Graph API returned an error", {
                url: path, status: res.status, code: errBody?.error?.code, message: errBody?.error?.message,
            })
            throw new BadGatewayException(
                errBody?.error?.message || `Meta Graph API error (HTTP ${res.status})`,
                { code: errBody?.error?.code, fbtraceId: errBody?.error?.fbtrace_id }
            )
        }
        return res.data as T
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        let res: AxiosResponse
        try {
            res = await this.http.post(path, body)
        } catch (err) {
            logger.error("Meta Graph API request failed (network)", { url: path, err })
            throw new BadGatewayException("Failed to reach Meta Graph API")
        }
        return this.unwrap<T>(path, res)
    }

    private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
        let res: AxiosResponse
        try {
            res = await this.http.get(path, { params })
        } catch (err) {
            logger.error("Meta Graph API request failed (network)", { url: path, err })
            throw new BadGatewayException("Failed to reach Meta Graph API")
        }
        return this.unwrap<T>(path, res)
    }

    async preAccept(phoneNumberId: string, callId: string, answerSdp: string): Promise<MetaCallActionResponse> {
        const body: MetaCallActionRequest = {
            messaging_product: "whatsapp",
            call_id: callId,
            action: "pre_accept",
            session: { sdp_type: "answer", sdp: answerSdp },
        }
        return this.post(`/${phoneNumberId}/calls`, body)
    }

    async accept(phoneNumberId: string, callId: string, answerSdp: string): Promise<MetaCallActionResponse> {
        const body: MetaCallActionRequest = {
            messaging_product: "whatsapp",
            call_id: callId,
            action: "accept",
            session: { sdp_type: "answer", sdp: answerSdp },
            ...this.recordingFields(),
        }
        return this.post(`/${phoneNumberId}/calls`, body)
    }

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

    async terminate(phoneNumberId: string, callId: string): Promise<MetaCallActionResponse> {
        const body: MetaCallActionRequest = {
            messaging_product: "whatsapp",
            call_id: callId,
            action: "terminate",
        }
        return this.post(`/${phoneNumberId}/calls`, body)
    }

    async connect(phoneNumberId: string, to: string, offerSdp: string): Promise<MetaCallActionResponse> {
        const body: MetaCallActionRequest = {
            messaging_product: "whatsapp",
            to,
            action: "connect",
            session: { sdp_type: "offer", sdp: offerSdp },
        }
        return this.post(`/${phoneNumberId}/calls`, body)
    }

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

    async getCallPermission(phoneNumberId: string, waId: string): Promise<MetaCallPermissionResponse> {
        return this.get(`/${phoneNumberId}/call_permissions`, { user_wa_id: waId })
    }

    async updateCallSettings(phoneNumberId: string, calling: Record<string, unknown>): Promise<{ success: boolean }> {
        return this.post(`/${phoneNumberId}/settings`, { calling })
    }

    async getCallSettings(phoneNumberId: string): Promise<MetaCallSettings> {
        return this.get(`/${phoneNumberId}/settings`)
    }

    async getHealthStatus(phoneNumberId: string): Promise<MetaHealthStatusResponse> {
        return this.get(`/${phoneNumberId}`, { fields: "health_status" })
    }

    async getMediaUrl(mediaId: string): Promise<{ url: string; mime_type: string; sha256: string; file_size?: number }> {
        return this.get(`/${mediaId}`)
    }

    async downloadMedia(url: string): Promise<Buffer> {
        const res = await this.http.get(url, { responseType: "arraybuffer" })
        if (res.status < 200 || res.status >= 300) {
            throw new BadGatewayException(`Failed to download media (HTTP ${res.status})`)
        }
        return Buffer.from(res.data)
    }
}

export const metaClient = new MetaClient()
