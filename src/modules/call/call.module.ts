import { TypeOrmCallRepository } from "./repositories/call.repository"
import { TypeOrmCallEventRepository } from "./repositories/call-event.repository"
import { TypeOrmNusawaLogQueueRepository } from "./repositories/nusawa-log-queue.repository"
import { TypeOrmCallRecordingRepository } from "./repositories/call-recording.repository"
import { CallStateService } from "./call-state.service"
import { CallService } from "./call.service"
import { CallController } from "./call.controller"
import { NusawaLogService } from "./nusawa-log.service"
import { CallRecordingService } from "./call-recording.service"
import { CallSignalingService } from "./call-signaling.service"
import { AsteriskCallHandlerService } from "./asterisk-call-handler.service"
import { nusawaClient } from "../../infrastructure/nusawa/nusawa.client"
import { minioClient } from "../../infrastructure/minio/minio.client"
import { signalingGateway } from "../../gateway/signaling.gateway"
import { routingService } from "../routing/routing.module"
import { contactService } from "../contact/contact.module"
import { accountRepository } from "../account/account.module"
import { permissionService } from "../permission/permission.module"
import { CallSerializer } from "./serializers/call.serialize"

export const callRepository = new TypeOrmCallRepository()
const callEventRepository = new TypeOrmCallEventRepository()
const nusawaLogQueueRepository = new TypeOrmNusawaLogQueueRepository()
const callRecordingRepository = new TypeOrmCallRecordingRepository()

export const callStateService = new CallStateService(callRepository, callEventRepository)
export const callService = new CallService(callRepository)
export const nusawaLogService = new NusawaLogService(nusawaLogQueueRepository, nusawaClient)
export const callRecordingService = new CallRecordingService(callRecordingRepository, minioClient)

export const asteriskCallHandler = new AsteriskCallHandlerService(
    callStateService,
    callRepository,
    contactService,
    accountRepository,
)

export const callSignalingService = new CallSignalingService(
    signalingGateway,
    callRepository,
    callStateService,
    asteriskCallHandler,
    routingService,
    nusawaLogService,
    contactService,
    accountRepository,
    permissionService,
)

asteriskCallHandler.attachSignaling(callSignalingService)
signalingGateway.attachService(callSignalingService)

callStateService.attachBoardListener(async (call) => {
    signalingGateway.broadcast({ type: "call_board", wacid: call.wacid, data: await CallSerializer.single(call), ts: Date.now() })
})

export const callController = new CallController(callService, callRecordingService, callSignalingService)
