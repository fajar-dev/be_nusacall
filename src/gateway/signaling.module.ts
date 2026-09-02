import { join } from "node:path"
import { readFile } from "node:fs/promises"
import { signalingGateway } from "./signaling.gateway"
import { CallSignalingService } from "../modules/call/call-signaling.service"
import { AsteriskCallHandlerService } from "../modules/call/asterisk-call-handler.service"
import { callRepository, callStateService, nusawaLogService, callRecordingService } from "../modules/call/call.module"
import { CallSerializer } from "../modules/call/serializers/call.serialize"
import { routingService } from "../modules/routing/routing.module"
import { contactService } from "../modules/contact/contact.module"
import { accountRepository } from "../modules/account/account.module"
import { ariClient } from "../infrastructure/asterisk/ari.client"
import { config } from "../config/config"
import { logger } from "../core/helpers/logger"

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
)

asteriskCallHandler.attachSignaling(callSignalingService)

signalingGateway.attachService(callSignalingService)

callStateService.attachBoardListener(async (call) => {
    signalingGateway.broadcast({ type: "call_board", wacid: call.wacid, data: await CallSerializer.single(call), ts: Date.now() })
})

export { signalingGateway }

/** Nama rekaman dibentuk sebagai `nusacall-<wacid>` saat bridge mulai direkam. */
ariClient.onRecordingFinished(async (event) => {
    const wacid = event.recording.name.replace(/^nusacall-/, "")
    const call = await callRepository.findByWacid(wacid)
    if (!call) {
        logger.warn("Recording finished for an unknown wacid — nothing to attach it to", { wacid })
        return
    }

    const filePath = join(config.recording.spoolDir, `${event.recording.name}.${event.recording.format}`)
    await callRecordingService.storeRecording(call.id, wacid, filePath, event.recording.duration ?? 0, readFile)
})
