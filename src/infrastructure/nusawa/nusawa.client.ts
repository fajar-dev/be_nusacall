import axios, { AxiosInstance } from "axios"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"

export class NusawaClient {
    private readonly http: AxiosInstance = axios.create({
        baseURL: config.nusawa.baseUrl,
        timeout: config.nusawa.lookupTimeoutMs,
        headers: {
            "x-api-key": config.nusawa.apiKey,
            "Content-Type": "application/json",
        },
    })

    async logCallMessage(params: { phoneNumberId: string; wacid: string; to: string; body: string }): Promise<boolean> {
        try {
            const res = await this.http.post(
                "/api/messages",
                { to: params.to, id: params.wacid, type: "text", text: { body: params.body } },
                { params: { no_send: "1", phone_number_id: params.phoneNumberId, ref: params.wacid } }
            )
            return res.status >= 200 && res.status < 300
        } catch (err) {
            logger.warn("nusawa logCallMessage failed", { wacid: params.wacid, err })
            return false
        }
    }

    async sendCallPermissionRequest(
        phoneNumberId: string,
        waId: string,
        templateName?: string,
        templateLanguage?: string
    ): Promise<any> {
        try {
            const res = await this.http.post(
                "/api/messages",
                {
                    phone_number_id: phoneNumberId,
                    messaging_product: "whatsapp",
                    to: waId,
                    type: "template",
                    template: {
                        name: templateName || config.outbound.permissionTemplateName || "call_permission_request",
                        language: {
                            code: templateLanguage || config.outbound.permissionTemplateLanguage || "en_US",
                        },
                        components: [],
                    },
                },
                {
                    params: { phone_number_id: phoneNumberId },
                }
            )
            return res.data
        } catch (err) {
            logger.error("nusawa sendCallPermissionRequest failed", { phoneNumberId, waId, err })
            throw err
        }
    }
}

export const nusawaClient = new NusawaClient()
