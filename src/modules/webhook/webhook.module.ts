import { callRepository, callStateService } from "../call/call.module"
import { contactService } from "../contact/contact.module"
import { callSignalingService } from "../../gateway/signaling.module"
import { WebhookService } from "./webhook.service"
import { WebhookController } from "./webhook.controller"
import type { ICallSignalingNotifier } from "../call/interfaces/call-signaling.interface"

export function buildWebhookController(
    signaling: ICallSignalingNotifier = callSignalingService,
): WebhookController {
    const service = new WebhookService(callStateService, signaling, callRepository, contactService)
    return new WebhookController(service)
}

export const webhookController = buildWebhookController()
