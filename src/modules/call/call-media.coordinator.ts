import { sessionRegistry } from "../../infrastructure/media/session-registry"
import { MetaClient } from "../../infrastructure/meta/meta.client"
import { logger } from "../../core/helpers/logger"
import { ICallMediaCoordinator, EstablishEarlyResult } from "./interfaces/call-media-coordinator.interface"

export class CallMediaCoordinator implements ICallMediaCoordinator {
    constructor(private readonly metaClient: MetaClient) {}

    async establishEarly(wacid: string, phoneNumberId: string, offerSdp: string): Promise<EstablishEarlyResult> {
        try {
            const session = sessionRegistry.create(wacid)
            const answerSdp = await session.acceptMetaOffer(offerSdp)
            await this.metaClient.preAccept(phoneNumberId, wacid, answerSdp)
            logger.info("pre_accept sent successfully", { wacid })
            return { ok: true }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error("Failed to establish media / send pre_accept", { wacid, err })
            await sessionRegistry.remove(wacid, "pre_accept_failed")
            return { ok: false, error: message }
        }
    }

    async teardown(wacid: string, reason: string): Promise<void> {
        await sessionRegistry.remove(wacid, reason)
    }
}
