import { signalingGateway } from "./signaling.gateway"
import { CallSignalingService } from "../modules/call/call-signaling.service"
import { callRepository, callStateService, nusawaLogService } from "../modules/call/call.module"
import { metaClient } from "../infrastructure/meta/meta.client"
import { routingService } from "../modules/routing/routing.module"

export const callSignalingService = new CallSignalingService(
    signalingGateway,
    callRepository,
    callStateService,
    metaClient,
    routingService,
    nusawaLogService,
)

signalingGateway.attachService(callSignalingService)

export { signalingGateway }
