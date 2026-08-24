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

    async applyOutboundAnswer(wacid: string, answerSdp: string): Promise<EstablishEarlyResult> {
        const session = sessionRegistry.get(wacid)
        if (!session) {
            logger.error("applyOutboundAnswer: no media session found — was initiateOutbound() ever called for this wacid?", { wacid })
            return { ok: false, error: "No media session for this call" }
        }
        try {
            await session.applyMetaAnswer(answerSdp)
            return { ok: true }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            logger.error("Failed to apply outbound Meta answer", { wacid, err })
            return { ok: false, error: message }
        }
    }

    async startOutboundForwarding(wacid: string): Promise<void> {
        const session = sessionRegistry.get(wacid)
        if (!session) {
            logger.warn("startOutboundForwarding: no media session found", { wacid })
            return
        }
        session.startForwarding()
    }
}
