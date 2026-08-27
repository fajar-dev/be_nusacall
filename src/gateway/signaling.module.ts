import { signalingGateway } from "./signaling.gateway"
import { CallSignalingService } from "../modules/call/call-signaling.service"
import { callRepository, callStateService, nusawaLogService } from "../modules/call/call.module"
import { CallSerializer } from "../modules/call/serializers/call.serialize"
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

/** Every status transition fans out to every connected client, keeping the shared call board live. */
callStateService.attachBoardListener(async (call) => {
    signalingGateway.broadcast({ type: "call_board", wacid: call.wacid, data: await CallSerializer.single(call), ts: Date.now() })
})

export { signalingGateway }
