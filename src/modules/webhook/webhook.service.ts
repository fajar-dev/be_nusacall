import { Call } from "../call/entities/call.entity"
import { CallStateService } from "../call/call-state.service"
import { CallStatus, isTerminalCallStatus } from "../call/enums/call-status.enum"
import { CallDirection, fromMetaDirection } from "../call/enums/call-direction.enum"
import { EndReason } from "../call/enums/end-reason.enum"
import { CallEventType } from "../call/enums/call-event-type.enum"
import { CallEventStatus } from "../call/enums/call-event-status.enum"
import { ICallMediaCoordinator } from "../call/interfaces/call-media-coordinator.interface"
import { ICallSignalingNotifier } from "../call/interfaces/call-signaling.interface"
import { ICallRepository } from "../call/interfaces/call.repository.interface"
import { CallRecordingService } from "../call/call-recording.service"
import { ContactService } from "../contact/contact.service"
import { logger } from "../../core/helpers/logger"
import { CallLogOutcome } from "../call/enums/call-log-outcome.enum"

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
    errors?: Array<{ code: number; message?: string; error_data?: { details?: string } }>
    call_recording?: { type: "audio"; audio: { id: string; sha256: string; mime_type: string; url: string } }
}

interface MetaStatusObject {
    id: string
    type: string
    status: CallEventStatus
    timestamp: string
    recipient_id?: string
}

interface MetaMetadata {
    display_phone_number: string
    phone_number_id: string
}

interface MetaContact {
    profile?: { name?: string }
    wa_id?: string
}

interface MetaAccountUpdateValue {
    event: string
    violation_info?: { violation_type: string }
    restriction_info?: Array<{ restriction_type: string; expiration?: number; remediation?: string }>
}

export class WebhookService {
    constructor(
        private readonly callState: CallStateService,
        private readonly media: ICallMediaCoordinator,
        private readonly signaling: ICallSignalingNotifier,
        private readonly calls: ICallRepository,
        private readonly recording: CallRecordingService,
        private readonly contacts: ContactService,
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
            return
        }

        for (const entry of payload.entry ?? []) {
            const businessAccountId: string = entry.id
            for (const change of entry.changes ?? []) {
                if (change.field === "account_update") {
                    this.handleAccountUpdate(change.value, businessAccountId)
                    continue
                }
                if (change.field !== "calls") continue
                await this.processChangeValue(change.value, payload)
            }
        }
    }

    private async processChangeValue(value: any, fullPayload: unknown): Promise<void> {
        const metadata: MetaMetadata | undefined = value.metadata
        const contacts: MetaContact[] = value.contacts ?? []

        for (const callObj of (value.calls ?? []) as MetaCallObject[]) {
            try {
                if (callObj.event === "connect") {
                    await this.handleConnect(callObj, metadata, contacts, fullPayload)
                } else if (callObj.event === "terminate") {
                    await this.handleTerminate(callObj, metadata, contacts, fullPayload)
                } else if (callObj.event === "call_created") {
                    await this.handleCallCreated(callObj, metadata, contacts, fullPayload)
                } else if (callObj.event === "call_recording_available") {
                    await this.handleRecordingAvailable(callObj)
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

    private async handleConnect(
        callObj: MetaCallObject,
        metadata: MetaMetadata | undefined,
        contacts: MetaContact[],
        fullPayload: unknown
    ): Promise<void> {
        const metaTimestamp = Number(callObj.timestamp) || undefined

        const { accepted } = await this.callState.recordEvent({
            wacid: callObj.id,
            eventType: CallEventType.CONNECT,
            metaTimestamp,
            rawPayload: fullPayload as Record<string, unknown>,
        })
        if (!accepted) return

        const direction = fromMetaDirection(callObj.direction ?? "USER_INITIATED")
        const waId = direction === CallDirection.INBOUND ? callObj.from : callObj.to
        const profileName = contacts[0]?.profile?.name ?? null
        const contactId = await this.resolveContactId(direction, waId ?? "", profileName)

        const defaults: Partial<Call> = {
            phoneNumberId: metadata?.phone_number_id ?? "",
            displayPhoneNumber: metadata?.display_phone_number ?? null,
            waId: waId ?? "",
            profileName,
            contactId,
            direction,
            status: CallStatus.PENDING,
            statusRank: 10,
        }

        const call = await this.callState.findOrCreate(callObj.id, defaults)

        if (isTerminalCallStatus(call.status)) {
            logger.info("connect webhook arrived after call already reached a terminal state — ignored", {
                wacid: callObj.id, status: call.status,
            })
            return
        }

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

    private async handleStatus(
        statusObj: MetaStatusObject,
        metadata: MetaMetadata | undefined,
        fullPayload: unknown
    ): Promise<void> {
        const metaTimestamp = Number(statusObj.timestamp) || undefined

        const { accepted } = await this.callState.recordEvent({
            wacid: statusObj.id,
            eventType: CallEventType.STATUS,
            eventStatus: statusObj.status,
            metaTimestamp,
            rawPayload: fullPayload as Record<string, unknown>,
        })
        if (!accepted) return

        const statusWaId = statusObj.recipient_id ?? ""
        const contactId = await this.resolveContactId(CallDirection.OUTBOUND, statusWaId, null)

        await this.callState.findOrCreate(statusObj.id, {
            phoneNumberId: metadata?.phone_number_id ?? "",
            waId: statusWaId,
            contactId,
            direction: CallDirection.OUTBOUND,
            status: CallStatus.PENDING,
            statusRank: 10,
        })

        switch (statusObj.status) {
            case CallEventStatus.RINGING:
                await this.callState.transition(statusObj.id, CallStatus.RINGING, { ringingAt: new Date() })
                break
            case CallEventStatus.ACCEPTED: {
                const transitioned = await this.callState.transition(statusObj.id, CallStatus.ACTIVE, { answeredAt: new Date() })
                if (transitioned) {
                    await this.media.startOutboundForwarding(statusObj.id)
                    const call = await this.calls.findByWacid(statusObj.id)
                    if (call) this.signaling.notifyOutboundActive(call)
                }
                break
            }
            case CallEventStatus.REJECTED:
                await this.callState.transition(statusObj.id, CallStatus.REJECTED, {
                    endReason: EndReason.CUSTOMER_REJECTED,
                    endedAt: new Date(),
                })
                break
        }
    }

    private async handleTerminate(
        callObj: MetaCallObject,
        metadata: MetaMetadata | undefined,
        contacts: MetaContact[],
        fullPayload: unknown
    ): Promise<void> {
        const metaTimestamp = Number(callObj.timestamp) || undefined

        const { accepted } = await this.callState.recordEvent({
            wacid: callObj.id,
            eventType: CallEventType.TERMINATE,
            metaTimestamp,
            rawPayload: fullPayload as Record<string, unknown>,
        })
        if (!accepted) return

        const direction = fromMetaDirection(callObj.direction ?? "USER_INITIATED")
        const waId = direction === CallDirection.INBOUND ? callObj.from : callObj.to
        const profileName = contacts[0]?.profile?.name ?? null
        const contactId = await this.resolveContactId(direction, waId ?? "", profileName)
        const call = await this.callState.findOrCreate(callObj.id, {
            phoneNumberId: metadata?.phone_number_id ?? "",
            displayPhoneNumber: metadata?.display_phone_number ?? null,
            waId: waId ?? "",
            profileName,
            contactId,
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

        if (transitioned) {
            const outcome = terminalStatus === CallStatus.COMPLETED ? CallLogOutcome.COMPLETED
                : terminalStatus === CallStatus.REJECTED ? CallLogOutcome.REJECTED
                : CallLogOutcome.MISSED
            const updatedCall = { ...call, ...patch }
            await this.signaling.logCallOutcome(updatedCall, outcome, patch.durationSeconds ?? null)
            this.signaling.notifyCallEnded(updatedCall, patch.endReason ?? EndReason.MEDIA_FAILURE)
        }
    }

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


    private async resolveContactId(direction: CallDirection, waId: string, profileName: string | null): Promise<number | null> {
        if (!waId) return null
        if (direction === CallDirection.INBOUND) {
            const contact = await this.contacts.findOrCreate(waId, profileName)
            return contact.id
        }
        const contact = await this.contacts.findByWaId(waId)
        return contact?.id ?? null
    }

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
        logger.info("Meta account_update received", { businessAccountId, event: value.event })
    }

    private resolveTerminalState(callObj: MetaCallObject, currentStatus: CallStatus): CallStatus {
        if (callObj.errors?.length) return CallStatus.FAILED
        if (callObj.status === "FAILED") return CallStatus.FAILED
        if (currentStatus === CallStatus.ACTIVE) return CallStatus.COMPLETED
        if (currentStatus === CallStatus.REJECTED) return CallStatus.REJECTED
        return CallStatus.ABANDONED
    }

    private mapEndReason(terminal: CallStatus, callObj: MetaCallObject): EndReason | null {
        if (terminal === CallStatus.FAILED) {
            return callObj.errors?.length ? EndReason.META_ERROR : EndReason.MEDIA_FAILURE
        }
        if (terminal === CallStatus.ABANDONED) return EndReason.CUSTOMER_HANGUP
        return null 
    }

    private async handleCallCreated(
        callObj: MetaCallObject,
        metadata: MetaMetadata | undefined,
        contacts: MetaContact[],
        fullPayload: unknown
    ): Promise<void> {
        const metaTimestamp = Number(callObj.timestamp) || undefined

        const { accepted } = await this.callState.recordEvent({
            wacid: callObj.id,
            eventType: CallEventType.CALL_CREATED,
            metaTimestamp,
            rawPayload: fullPayload as Record<string, unknown>,
        })
        if (!accepted) return

        const direction = fromMetaDirection(callObj.direction ?? "USER_INITIATED")
        const waId = direction === CallDirection.INBOUND ? callObj.from : callObj.to
        const profileName = contacts[0]?.profile?.name ?? null
        const contactId = await this.resolveContactId(direction, waId ?? "", profileName)

        await this.callState.findOrCreate(callObj.id, {
            phoneNumberId: metadata?.phone_number_id ?? "",
            displayPhoneNumber: metadata?.display_phone_number ?? null,
            waId: waId ?? "",
            profileName,
            contactId,
            direction,
            status: CallStatus.PENDING,
            statusRank: 10,
        })
    }
}
