import { join } from "node:path"
import { readFile } from "node:fs/promises"
import { signalingGateway } from "./signaling.gateway"
import { asteriskCallHandler, callSignalingService, callRepository, callRecordingService } from "../modules/call/call.module"
import { ariClient } from "../infrastructure/asterisk/ari.client"
import { config } from "../config/config"
import { logger } from "../core/helpers/logger"

export { signalingGateway, asteriskCallHandler, callSignalingService }

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
