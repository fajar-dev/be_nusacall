import axios, { AxiosResponse } from "axios"
import { config } from "../../config/config"
import { resolveApplication } from "./meta-credentials"
import { logger } from "../../core/helpers/logger"
import { BadGatewayException } from "../../core/exceptions/base"
import type {
    MetaErrorResponse,
    MetaCallPermissionResponse,
    MetaCallSettings,
    MetaHealthStatusResponse,
    MetaSendTemplateRequest,
    MetaSendMessageResponse,
    MetaMessageTemplatesResponse,
} from "./meta.types"

export class MetaClient {
    private async requestConfig(phoneNumberId: string) {
        const application = await resolveApplication(phoneNumberId)
        return {
            baseURL: application.apiUrl,
            headers: { Authorization: `Bearer ${application.accessToken}` },
            validateStatus: () => true,
        }
    }

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

    private async post<T>(phoneNumberId: string, path: string, body: unknown): Promise<T> {
        let res: AxiosResponse
        try {
            res = await axios.post(path, body, await this.requestConfig(phoneNumberId))
        } catch (err) {
            logger.error("Meta Graph API request failed (network)", { url: path, err })
            throw new BadGatewayException("Failed to reach Meta Graph API")
        }
        return this.unwrap<T>(path, res)
    }

    private async get<T>(phoneNumberId: string, path: string, params?: Record<string, string>): Promise<T> {
        let res: AxiosResponse
        try {
            res = await axios.get(path, { ...(await this.requestConfig(phoneNumberId)), params })
        } catch (err) {
            logger.error("Meta Graph API request failed (network)", { url: path, err })
            throw new BadGatewayException("Failed to reach Meta Graph API")
        }
        return this.unwrap<T>(path, res)
    }

    async sendCallPermissionRequest(
        phoneNumberId: string,
        waId: string,
        templateName: string,
        templateLanguage: string,
    ): Promise<MetaSendMessageResponse> {
        const body: MetaSendTemplateRequest = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: waId,
            type: "template",
            template: {
                name: templateName,
                language: { code: templateLanguage },
            },
        }
        return this.post(phoneNumberId, `/${phoneNumberId}/messages`, body)
    }

    async listMessageTemplates(phoneNumberId: string, businessAccountId: string): Promise<MetaMessageTemplatesResponse> {
        return this.get(phoneNumberId, `/${businessAccountId}/message_templates`, {
            fields: "id,name,language,status,category",
            limit: "200",
        })
    }

    async getCallPermission(phoneNumberId: string, waId: string): Promise<MetaCallPermissionResponse> {
        return this.get(phoneNumberId, `/${phoneNumberId}/call_permissions`, { user_wa_id: waId })
    }

    async updateCallSettings(phoneNumberId: string, calling: Record<string, unknown>): Promise<{ success: boolean }> {
        return this.post(phoneNumberId, `/${phoneNumberId}/settings`, { calling })
    }

    async getCallSettings(phoneNumberId: string): Promise<MetaCallSettings> {
        return this.get(phoneNumberId, `/${phoneNumberId}/settings`)
    }

    async getHealthStatus(phoneNumberId: string): Promise<MetaHealthStatusResponse> {
        return this.get(phoneNumberId, `/${phoneNumberId}`, { fields: "health_status" })
    }
}

export const metaClient = new MetaClient()
