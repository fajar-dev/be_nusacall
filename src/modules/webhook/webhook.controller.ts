import { Context } from "hono"
import { WebhookService } from "./webhook.service"
import { verifyMetaSignature } from "../../core/helpers/signature"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"
import { UnauthorizedException } from "../../core/exceptions/base"

export class WebhookController {
    constructor(private readonly service: WebhookService) {}

    /** GET /wh — Meta's subscription handshake. */
    async verify(c: Context) {
        const mode = c.req.query("hub.mode")
        const token = c.req.query("hub.verify_token")
        const challenge = c.req.query("hub.challenge")

        if (mode === "subscribe" && token === config.meta.verifyToken) {
            return c.text(challenge ?? "")
        }

        return c.body(null, 400)
    }

    /**
     * POST /wh — receives `calls` webhook events. Must reply fast (Meta
     * retries on timeout, creating duplicates); signature is checked on the
     * raw body before parsing, and processing happens after the reply is
     * queued. See docs/CALL-LIFECYCLE.md §5.
     */
    async receive(c: Context) {
        const raw = await c.req.text()
        const signature = c.req.header("x-hub-signature")

        if (!verifyMetaSignature(raw, signature)) {
            logger.warn("Webhook signature verification failed")
            throw new UnauthorizedException("Invalid webhook signature")
        }

        // Fire-and-forget: never await this in the request/response path.
        queueMicrotask(() => {
            this.service.process(raw).catch((err) => {
                logger.error("Webhook processing failed", { err })
            })
        })

        return c.body(null, 204)
    }
}
