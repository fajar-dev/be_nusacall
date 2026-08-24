import { TypeOrmCallRepository } from "./repositories/call.repository"
import { TypeOrmCallEventRepository } from "./repositories/call-event.repository"
import { TypeOrmNusawaLogQueueRepository } from "./repositories/nusawa-log-queue.repository"
import { CallStateService } from "./call-state.service"
import { CallService } from "./call.service"
import { CallController } from "./call.controller"
import { NusawaLogService } from "./nusawa-log.service"
import { nusawaClient } from "../../infrastructure/nusawa/nusawa.client"

export const callRepository = new TypeOrmCallRepository()
export const callEventRepository = new TypeOrmCallEventRepository()
export const nusawaLogQueueRepository = new TypeOrmNusawaLogQueueRepository()
export const callStateService = new CallStateService(callRepository, callEventRepository)
export const callService = new CallService(callRepository)
export const nusawaLogService = new NusawaLogService(nusawaLogQueueRepository, nusawaClient)
export const callController = new CallController(callService)
