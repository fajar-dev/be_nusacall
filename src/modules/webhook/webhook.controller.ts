import { Context } from "hono"
import { WebhookService } from "./webhook.service"
import { verifyMetaSignature } from "../../core/helpers/signature"
import { metaApplications } from "../../config/meta-applications"
import { logger } from "../../core/helpers/logger"
import { UnauthorizedException } from "../../core/exceptions/base"

export class WebhookController {
    constructor(private readonly service: WebhookService) {}

    async verify(c: Context) {
        const mode = c.req.query("hub.mode")
        const token = c.req.query("hub.verify_token")
        const challenge = c.req.query("hub.challenge")

        if (mode === "subscribe" && token && metaApplications.verifyTokenMatches(token)) {
            return c.text(challenge ?? "")
        }

        return c.body(null, 400)
    }

    async receive(c: Context) {
        const raw = await c.req.text()
        const signature = c.req.header("x-hub-signature")

        if (!verifyMetaSignature(raw, signature)) {
            logger.warn("Webhook signature verification failed")
            throw new UnauthorizedException("Invalid webhook signature")
        }

        queueMicrotask(() => {
            this.service.process(raw).catch((err) => {
                logger.error("Webhook processing failed", { err })
            })
        })

        return c.body(null, 204)
    }
}
