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
import { minio } from "../../infrastructure/minio/minio.client"

export const callRepository = new TypeOrmCallRepository()
const callEventRepository = new TypeOrmCallEventRepository()
const nusawaLogQueueRepository = new TypeOrmNusawaLogQueueRepository()
const callRecordingRepository = new TypeOrmCallRecordingRepository()
export const callStateService = new CallStateService(callRepository, callEventRepository)
export const callService = new CallService(callRepository)
export const nusawaLogService = new NusawaLogService(nusawaLogQueueRepository, nusawaClient)
export const callRecordingService = new CallRecordingService(callRecordingRepository, metaClient, minio)
export const callController = new CallController(callService, callRecordingService)
