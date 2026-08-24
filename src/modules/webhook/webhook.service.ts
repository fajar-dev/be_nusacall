import { Call } from "../call/entities/call.entity"
import { CallStateService } from "../call/call-state.service"
import { CallStatus, isTerminalCallStatus } from "../call/enum/call-status.enum"
import { CallDirection, fromMetaDirection } from "../call/enum/call-direction.enum"
import { EndReason } from "../call/enum/end-reason.enum"
import { ICallMediaCoordinator } from "../call/interfaces/call-media-coordinator.interface"
import { ICallSignalingNotifier } from "../call/interfaces/call-signaling.interface"
import { ICallRepository } from "../call/interfaces/call.repository.interface"
import { CallRecordingService } from "../call/call-recording.service"
import { logger } from "../../core/helpers/logger"

interface MetaCallObject {
    id: string
    to?: string
    from?: string
    event: string
    timestamp: string
    direction?: "USER_INITIATED" | "BUSINESS_INITIATED"
    session?: { sdp_type: string; sdp: string }
    status?: "FAILED" | "COMPLETED"
    start_time?: string
    end_time?: string
    duration?: number
    cta_payload?: string
    deeplink_payload?: string
    biz_opaque_callback_data?: string
    errors?: Array<{ code: number; message?: string; error_data?: { details?: string } }>
    call_recording?: { type: "audio"; audio: { id: string; sha256: string; mime_type: string; url: string } }
    call_transcript?: { document: { id: string; sha256: string; mime_type: string; url: string } }
}

interface MetaStatusObject {
    id: string
    type: string
    status: "RINGING" | "ACCEPTED" | "REJECTED"
    timestamp: string
    recipient_id?: string
    biz_opaque_callback_data?: string
}

interface MetaMetadata {
    display_phone_number: string
    phone_number_id: string
}

interface MetaContact {
    profile?: { name?: string }
    wa_id?: string
}

/**
 * docs/webhooks/reference/account_update — a different webhook field
 * entirely from `calls`, WABA-scoped (no phone_number in the payload).
 * `event` has many values (billing, partner, etc.); only the two calling-
 * relevant ones are typed here.
 */
interface MetaAccountUpdateValue {
    event: string
    violation_info?: { violation_type: string }
    restriction_info?: Array<{ restriction_type: string; expiration?: number; remediation?: string }>
}

/**
 * Turns Meta's `calls` webhook payload into Call state transitions.
 * Every handler: recordEvent() (idempotency/staleness gate — stop if not
 * accepted) then transition() via the SQL rank guard, which is what
 * actually resolves out-of-order delivery. See docs/CALL-LIFECYCLE.md §6.
 */
export class WebhookService {
    constructor(
        private readonly callState: CallStateService,
        private readonly media: ICallMediaCoordinator,
        private readonly signaling: ICallSignalingNotifier,
        private readonly calls: ICallRepository,
        private readonly recording: CallRecordingService,
    ) {}

    async process(rawBody: string): Promise<void> {
        let payload: any
        try {
            payload = JSON.parse(rawBody)
        } catch (err) {
            logger.warn("Webhook payload is not valid JSON — ignored", { err })
            return
        }

        if (payload?.object !== "whatsapp_business_account") {
            return // not ours to handle
        }

        for (const entry of payload.entry ?? []) {
            const businessAccountId: string = entry.id
            for (const change of entry.changes ?? []) {
                if (change.field === "account_update") {
                    this.handleAccountUpdate(change.value, businessAccountId)
                    continue
                }
                if (change.field !== "calls") continue
                await this.processChangeValue(change.value, businessAccountId, payload)
            }
        }
    }

    private async processChangeValue(value: any, businessAccountId: string, fullPayload: unknown): Promise<void> {
        const metadata: MetaMetadata | undefined = value.metadata
        const contacts: MetaContact[] = value.contacts ?? []

        for (const callObj of (value.calls ?? []) as MetaCallObject[]) {
            try {
                if (callObj.event === "connect") {
                    await this.handleConnect(callObj, metadata, businessAccountId, contacts, fullPayload)
                } else if (callObj.event === "terminate") {
                    await this.handleTerminate(callObj, metadata, businessAccountId, contacts, fullPayload)
                } else if (callObj.event === "call_created") {
                    await this.handleCallCreated(callObj, metadata, businessAccountId, contacts, fullPayload)
                } else if (callObj.event === "call_recording_available") {
                    await this.handleRecordingAvailable(callObj)
                } else if (callObj.event === "call_transcription_available") {
                    await this.handleTranscriptAvailable(callObj)
                } else {
                    logger.info("Unhandled call event type", { event: callObj.event, wacid: callObj.id })
                }
            } catch (err) {
                logger.error("Failed processing call event", { wacid: callObj.id, event: callObj.event, err })
            }
        }

        for (const statusObj of (value.statuses ?? []) as MetaStatusObject[]) {
            try {
                await this.handleStatus(statusObj, metadata, fullPayload)
            } catch (err) {
                logger.error("Failed processing status event", { wacid: statusObj.id, err })
            }
        }
    }

    // ── connect ──────────────────────────────────────────────────────────

    private async handleConnect(
        callObj: MetaCallObject,
        metadata: MetaMetadata | undefined,
        businessAccountId: string,
        contacts: MetaContact[],
        fullPayload: unknown
    ): Promise<void> {
        const metaTimestamp = Number(callObj.timestamp) || undefined

        const { accepted } = await this.callState.recordEvent({
            wacid: callObj.id,
            eventType: "connect",
            metaTimestamp,
            rawPayload: fullPayload as Record<string, unknown>,
        })
        if (!accepted) return

        const direction = fromMetaDirection(callObj.direction ?? "USER_INITIATED")
        const waId = direction === CallDirection.INBOUND ? callObj.from : callObj.to

        const defaults: Partial<Call> = {
            phoneNumberId: metadata?.phone_number_id ?? "",
            businessAccountId,
            displayPhoneNumber: metadata?.display_phone_number ?? null,
            waId: waId ?? "",
            profileName: contacts[0]?.profile?.name ?? null,
            direction,
            status: CallStatus.PENDING,
            statusRank: 10,
            connectedWebhookAt: new Date(),
            ctaPayload: callObj.cta_payload ?? null,
            deeplinkPayload: callObj.deeplink_payload ?? null,
            bizOpaqueCallbackData: callObj.biz_opaque_callback_data ?? null,
        }

        // If the row already exists (e.g. a `terminate` webhook for this wacid
        // arrived first — Meta does not guarantee ordering), findOrCreate
        // returns it UNCHANGED. We deliberately do NOT then try to force it
        // back to PENDING: the rank guard would reject it anyway, and even
        // attempting it would be misleading in the logs.
        const call = await this.callState.findOrCreate(callObj.id, defaults)

        if (isTerminalCallStatus(call.status)) {
            logger.info("connect webhook arrived after call already reached a terminal state — ignored", {
                wacid: callObj.id, status: call.status,
            })
            return
        }

        // Establish the Meta-facing media leg and send pre_accept as early as
        // possible (docs/MEDIA-PLANE.md §5) — a side action, not a state
        // transition. Only once that succeeds do we ring agents (RINGING).
        if (direction === CallDirection.INBOUND && callObj.session?.sdp) {
            const result = await this.media.establishEarly(callObj.id, metadata?.phone_number_id ?? "", callObj.session.sdp)
            if (!result.ok) {
                await this.callState.transition(callObj.id, CallStatus.FAILED, {
                    endReason: EndReason.MEDIA_FAILURE,
                    endedAt: new Date(),
                    errorMessage: result.error ?? null,
                })
                return
            }

            await this.signaling.notifyIncoming(call)
        }

        // Fase 3 (BIC): Meta relays the WhatsApp user's SDP answer back on
        // this same `connect` event, direction BUSINESS_INITIATED — the
        // Call row and MediaSession already exist from
        // CallSignalingService.initiateOutbound(), we're just completing
        // the negotiation, not creating anything.
        if (direction === CallDirection.OUTBOUND && callObj.session?.sdp) {
            const result = await this.media.applyOutboundAnswer(callObj.id, callObj.session.sdp)
            if (!result.ok) {
                await this.callState.transition(callObj.id, CallStatus.FAILED, {
                    endReason: EndReason.MEDIA_FAILURE,
                    endedAt: new Date(),
                    errorMessage: result.error ?? null,
                })
            }
        }
    }

    // ── status (RINGING / ACCEPTED / REJECTED) ──────────────────────────

    private async handleStatus(
        statusObj: MetaStatusObject,
        metadata: MetaMetadata | undefined,
        fullPayload: unknown
    ): Promise<void> {
        const metaTimestamp = Number(statusObj.timestamp) || undefined

        const { accepted } = await this.callState.recordEvent({
            wacid: statusObj.id,
            eventType: "status",
            eventStatus: statusObj.status,
            metaTimestamp,
            rawPayload: fullPayload as Record<string, unknown>,
        })
        if (!accepted) return

        // Status webhooks can arrive before `connect` in edge cases — create
        // a minimal row so the transition below has something to act on.
        await this.callState.findOrCreate(statusObj.id, {
            phoneNumberId: metadata?.phone_number_id ?? "",
            waId: statusObj.recipient_id ?? "",
            direction: CallDirection.OUTBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
        })

        switch (statusObj.status) {
            case "RINGING":
                await this.callState.transition(statusObj.id, CallStatus.RINGING, { ringingAt: new Date() })
                break
            case "ACCEPTED": {
                const transitioned = await this.callState.transition(statusObj.id, CallStatus.ACTIVE, { answeredAt: new Date() })
                if (transitioned) {
                    // The user's phone actually picked up — safe to flow
                    // media now (docs/MEDIA-PLANE.md §5: never before this).
                    await this.media.startOutboundForwarding(statusObj.id)
                    const call = await this.calls.findByWacid(statusObj.id)
                    if (call) this.signaling.notifyOutboundActive(call)
                }
                break
            }
            case "REJECTED":
                await this.callState.transition(statusObj.id, CallStatus.REJECTED, {
                    endReason: EndReason.CUSTOMER_REJECTED,
                    endedAt: new Date(),
                })
                break
        }
    }

    // ── terminate ────────────────────────────────────────────────────────

    private async handleTerminate(
        callObj: MetaCallObject,
        metadata: MetaMetadata | undefined,
        businessAccountId: string,
        contacts: MetaContact[],
        fullPayload: unknown
    ): Promise<void> {
        const metaTimestamp = Number(callObj.timestamp) || undefined

        const { accepted } = await this.callState.recordEvent({
            wacid: callObj.id,
            eventType: "terminate",
            metaTimestamp,
            rawPayload: fullPayload as Record<string, unknown>,
        })
        if (!accepted) return

        const direction = fromMetaDirection(callObj.direction ?? "USER_INITIATED")
        const waId = direction === CallDirection.INBOUND ? callObj.from : callObj.to

        // Same defaults shape as connect — this is what makes the "terminate
        // arrives before connect" scenario work: if the row doesn't exist
        // yet, it's created here, fully populated from the terminate payload.
        const call = await this.callState.findOrCreate(callObj.id, {
            phoneNumberId: metadata?.phone_number_id ?? "",
            businessAccountId,
            displayPhoneNumber: metadata?.display_phone_number ?? null,
            waId: waId ?? "",
            profileName: contacts[0]?.profile?.name ?? null,
            direction,
            status: CallStatus.PENDING,
            statusRank: 10,
        })

        const terminalStatus = this.resolveTerminalState(callObj, call.status)

        const patch: Partial<Call> = {
            endedAt: new Date(),
            endReason: this.mapEndReason(terminalStatus, callObj),
        }
        if (callObj.duration !== undefined) patch.durationSeconds = Number(callObj.duration)
        if (callObj.errors?.length) {
            patch.errorCode = callObj.errors[0]!.code
            patch.errorMessage = callObj.errors[0]!.message || callObj.errors[0]!.error_data?.details || null
        }

        const transitioned = await this.callState.transition(callObj.id, terminalStatus, patch)
        await this.media.teardown(callObj.id, `terminate_webhook_${terminalStatus}`)

        // Only the transition that actually "wins" logs — e.g. an agent's
        // own hangup already logs itself; this covers customer-initiated
        // ends the agent-action paths never see.
        if (transitioned) {
            const outcome = terminalStatus === CallStatus.COMPLETED ? "completed"
                : terminalStatus === CallStatus.REJECTED ? "rejected"
                : "missed"
            const updatedCall = { ...call, ...patch }
            await this.signaling.logCallOutcome(updatedCall, outcome, patch.durationSeconds ?? null)
            this.signaling.notifyCallEnded(updatedCall, patch.endReason ?? EndReason.MEDIA_FAILURE)
        }
    }

    // ── recording / transcript (Fase 2) ─────────────────────────────────

    private async handleRecordingAvailable(callObj: MetaCallObject): Promise<void> {
        const recording = callObj.call_recording?.audio
        if (!recording) {
            logger.warn("call_recording_available with no audio object", { wacid: callObj.id })
            return
        }
        const call = await this.calls.findByWacid(callObj.id)
        if (!call) {
            logger.warn("call_recording_available for unknown wacid", { wacid: callObj.id })
            return
        }
        await this.recording.recordingAvailable({
            callId: call.id, wacid: callObj.id,
            mediaId: recording.id, sha256: recording.sha256, mimeType: recording.mime_type, url: recording.url,
        })
    }

    private async handleTranscriptAvailable(callObj: MetaCallObject): Promise<void> {
        const transcript = callObj.call_transcript?.document
        if (!transcript) {
            logger.warn("call_transcription_available with no document object", { wacid: callObj.id })
            return
        }
        const call = await this.calls.findByWacid(callObj.id)
        if (!call) {
            logger.warn("call_transcription_available for unknown wacid", { wacid: callObj.id })
            return
        }
        await this.recording.transcriptAvailable({
            callId: call.id, wacid: callObj.id,
            mediaId: transcript.id, sha256: transcript.sha256, mimeType: transcript.mime_type, url: transcript.url,
        })
    }

    // ── account_update (Fase 2/launch-gate) ─────────────────────────────

    /**
     * ACCOUNT_VIOLATION and ACCOUNT_RESTRICTION are launch-stop criteria
     * (docs/ROADMAP.md "Kriteria menghentikan peluncuran": "Menerima webhook
     * ACCOUNT_VIOLATION dari Meta" → stop and evaluate immediately). No
     * alerting channel exists in NusaCall yet, so this logs at `error`
     * level with full structured detail — the promtail/Grafana pipeline
     * already ingests these logs (docs/promtail-config.yaml), so this is
     * alertable today even without a dedicated notification system.
     * Sync (not async): nothing here does I/O, and WebhookService.process()
     * already returns 204 to Meta before any handler runs regardless.
     */
    private handleAccountUpdate(value: MetaAccountUpdateValue, businessAccountId: string): void {
        if (value.event === "ACCOUNT_VIOLATION") {
            logger.error("Meta account_update: ACCOUNT_VIOLATION — launch-stop criterion, evaluate immediately", {
                businessAccountId, violationType: value.violation_info?.violation_type,
            })
            return
        }
        if (value.event === "ACCOUNT_RESTRICTION") {
            logger.error("Meta account_update: ACCOUNT_RESTRICTION", {
                businessAccountId, restrictions: value.restriction_info,
            })
            return
        }
        // Everything else (billing, partner, disabled, etc.) — recorded for
        // audit, not actionable by NusaCall today.
        logger.info("Meta account_update received", { businessAccountId, event: value.event })
    }

    private resolveTerminalState(callObj: MetaCallObject, currentStatus: CallStatus): CallStatus {
        if (callObj.errors?.length) return CallStatus.FAILED
        if (callObj.status === "FAILED") return CallStatus.FAILED
        if (currentStatus === CallStatus.ACTIVE) return CallStatus.COMPLETED
        if (currentStatus === CallStatus.REJECTED) return CallStatus.REJECTED
        // Never reached ACTIVE — the customer (or business) hung up before
        // the call was answered.
        return CallStatus.ABANDONED
    }

    private mapEndReason(terminal: CallStatus, callObj: MetaCallObject): EndReason | null {
        if (terminal === CallStatus.FAILED) {
            return callObj.errors?.length ? EndReason.META_ERROR : EndReason.MEDIA_FAILURE
        }
        if (terminal === CallStatus.ABANDONED) return EndReason.CUSTOMER_HANGUP
        return null // COMPLETED/REJECTED: reason set by the agent-action path, not here
    }

    // ── call_created (SIP only — informational, no session/SDP) ─────────

    private async handleCallCreated(
        callObj: MetaCallObject,
        metadata: MetaMetadata | undefined,
        businessAccountId: string,
        contacts: MetaContact[],
        fullPayload: unknown
    ): Promise<void> {
        const metaTimestamp = Number(callObj.timestamp) || undefined

        const { accepted } = await this.callState.recordEvent({
            wacid: callObj.id,
            eventType: "call_created",
            metaTimestamp,
            rawPayload: fullPayload as Record<string, unknown>,
        })
        if (!accepted) return

        const direction = fromMetaDirection(callObj.direction ?? "USER_INITIATED")
        const waId = direction === CallDirection.INBOUND ? callObj.from : callObj.to

        await this.callState.findOrCreate(callObj.id, {
            phoneNumberId: metadata?.phone_number_id ?? "",
            businessAccountId,
            displayPhoneNumber: metadata?.display_phone_number ?? null,
            waId: waId ?? "",
            profileName: contacts[0]?.profile?.name ?? null,
            direction,
            status: CallStatus.PENDING,
            statusRank: 10,
        })
    }
}
