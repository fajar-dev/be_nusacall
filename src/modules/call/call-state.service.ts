import { createHash } from "node:crypto"
import { Call } from "./entities/call.entity"
import { CallStatus, CALL_STATUS_RANK } from "./enums/call-status.enum"
import { CallEventType } from "./enums/call-event-type.enum"
import { CallEventStatus } from "./enums/call-event-status.enum"
import { ICallRepository } from "./interfaces/call.repository.interface"
import { ICallEventRepository } from "./interfaces/call-event.repository.interface"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"

export interface WebhookEventInput {
    wacid: string
    eventType: CallEventType
    eventStatus?: CallEventStatus | null
    metaTimestamp?: number | null
    rawPayload: Record<string, unknown>
}

export interface ProcessResult {
    accepted: boolean
    isStale: boolean
    call: Call | null
}

export type CallBoardListener = (call: Call) => void | Promise<void>

export class CallStateService {
    private boardListener: CallBoardListener | null = null

    constructor(
        private readonly calls: ICallRepository,
        private readonly events: ICallEventRepository,
    ) {}

    attachBoardListener(listener: CallBoardListener): void {
        this.boardListener = listener
    }

    static redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
        const clone = JSON.parse(JSON.stringify(payload))
        const entries = (clone as any)?.entry
        if (Array.isArray(entries)) {
            for (const entry of entries) {
                const changes = entry?.changes
                if (!Array.isArray(changes)) continue
                for (const change of changes) {
                    const calls = change?.value?.calls
                    if (Array.isArray(calls)) {
                        for (const c of calls) {
                            if (c?.session) c.session = { sdp_type: c.session.sdp_type, sdp: "<redacted>" }
                        }
                    }
                }
            }
        }
        return clone
    }

    computeDedupKey(input: WebhookEventInput): string {
        const parts = [input.wacid, input.eventType, input.eventStatus ?? "", String(input.metaTimestamp ?? "")]
        return createHash("sha256").update(parts.join("|")).digest("hex")
    }

    isStale(metaTimestampSeconds?: number | null): boolean {
        if (!metaTimestampSeconds) return false
        const ageSeconds = Date.now() / 1000 - metaTimestampSeconds
        return ageSeconds > config.call.webhookStaleSeconds
    }

    async recordEvent(input: WebhookEventInput): Promise<ProcessResult> {
        const dedupKey = this.computeDedupKey(input)
        const stale = this.isStale(input.metaTimestamp)

        const call = await this.calls.findByWacid(input.wacid)

        const inserted = await this.events.tryInsert({
            dedupKey,
            wacid: input.wacid,
            callId: call?.id ?? null,
            eventType: input.eventType,
            eventStatus: input.eventStatus ?? null,
            metaTimestamp: input.metaTimestamp != null ? String(input.metaTimestamp) : null,
            payload: CallStateService.redactPayload(input.rawPayload),
            isStale: stale,
        })

        if (!inserted) {
            logger.info("Duplicate webhook ignored", { wacid: input.wacid, eventType: input.eventType, dedupKey })
            return { accepted: false, isStale: stale, call }
        }

        if (stale) {
            logger.warn("Stale webhook accepted-for-audit but not acted on", {
                wacid: input.wacid, eventType: input.eventType, metaTimestamp: input.metaTimestamp,
            })
            return { accepted: false, isStale: true, call }
        }

        return { accepted: true, isStale: false, call }
    }

    async findOrCreate(wacid: string, defaults: Partial<Call>): Promise<Call> {
        const call = await this.calls.findOrCreateByWacid(wacid, defaults)
        await this.events.linkToCall(wacid, call.id)
        return call
    }

    async transition(wacid: string, nextStatus: CallStatus, patch: Partial<Call> = {}): Promise<boolean> {
        const nextRank = CALL_STATUS_RANK[nextStatus]
        const affected = await this.calls.updateIfRankLower(wacid, nextStatus, nextRank, patch)

        if (affected === 0) {
            logger.info("Transition rejected by rank guard (out-of-order or duplicate)", { wacid, nextStatus })
            return false
        }

        if (this.boardListener) {
            const updated = await this.calls.findByWacid(wacid)
            if (updated) this.boardListener(updated)
        }

        return true
    }
}
