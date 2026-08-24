import { callRepository, callEventRepository, callStateService } from "../call/call.module"
import { CallMediaCoordinator } from "../call/call-media.coordinator"
import { metaClient } from "../../infrastructure/meta/meta.client"
import { callSignalingService } from "../../gateway/signaling.module"
import { WebhookService } from "./webhook.service"
import { WebhookController } from "./webhook.controller"
import type { ICallMediaCoordinator } from "../call/interfaces/call-media-coordinator.interface"
import type { ICallSignalingNotifier } from "../call/interfaces/call-signaling.interface"

const callMediaCoordinator = new CallMediaCoordinator(metaClient)

/**
 * Builds a WebhookController with overridable media/signaling deps — used by
 * test/setup.ts to inject no-op stubs so state-machine tests never trigger
 * real WebRTC negotiation, Meta Graph API calls, or WebSocket pushes.
 * Production (src/index.ts) uses the `webhookController` singleton below.
 */
export function buildWebhookController(
    media: ICallMediaCoordinator = callMediaCoordinator,
    signaling: ICallSignalingNotifier = callSignalingService,
): WebhookController {
    const service = new WebhookService(callStateService, media, signaling)
    return new WebhookController(service)
}

export const webhookController = buildWebhookController()
export { callStateService, callRepository, callEventRepository, callMediaCoordinator }
