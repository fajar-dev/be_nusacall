import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"

export class NusawaClient {

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
