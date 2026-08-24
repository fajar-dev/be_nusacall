import { TypeOrmCallRepository } from "./repositories/call.repository"
import { TypeOrmCallEventRepository } from "./repositories/call-event.repository"
import { TypeOrmNusawaLogQueueRepository } from "./repositories/nusawa-log-queue.repository"
import { TypeOrmCallRecordingRepository } from "./repositories/call-recording.repository"
import { CallStateService } from "./call-state.service"
import { CallService } from "./call.service"
import { CallController } from "./call.controller"
import { NusawaLogService } from "./nusawa-log.service"
import { CallRecordingService } from "./call-recording.service"
import { nusawaClient } from "../../infrastructure/nusawa/nusawa.client"
import { metaClient } from "../../infrastructure/meta/meta.client"
import { minio } from "../../core/helpers/minio"

export const callRepository = new TypeOrmCallRepository()
export const callEventRepository = new TypeOrmCallEventRepository()
export const nusawaLogQueueRepository = new TypeOrmNusawaLogQueueRepository()
export const callRecordingRepository = new TypeOrmCallRecordingRepository()
export const callStateService = new CallStateService(callRepository, callEventRepository)
export const callService = new CallService(callRepository)
export const nusawaLogService = new NusawaLogService(nusawaLogQueueRepository, nusawaClient)
export const callRecordingService = new CallRecordingService(callRecordingRepository, metaClient, minio)
export const callController = new CallController(callService, callRecordingService)
