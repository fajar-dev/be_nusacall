import { CallStateService } from "../call/call-state.service"
import { CallStatus } from "../call/enums/call-status.enum"
import { CallDirection } from "../call/enums/call-direction.enum"
import { EndReason } from "../call/enums/end-reason.enum"
import { CallEventType } from "../call/enums/call-event-type.enum"
import { CallEventStatus } from "../call/enums/call-event-status.enum"
import { ICallSignalingNotifier } from "../call/interfaces/call-signaling.interface"
import { ICallRepository } from "../call/interfaces/call.repository.interface"
import { ContactService } from "../contact/contact.service"
import { logger } from "../../core/helpers/logger"
import { config } from "../../config/config"

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

interface MetaAccountUpdateValue {
    event: string
    violation_info?: { violation_type: string }
    restriction_info?: Array<{ restriction_type: string; expiration?: number; remediation?: string }>
}

export class WebhookService {
    constructor(
        private readonly callState: CallStateService,
        private readonly signaling: ICallSignalingNotifier,
        private readonly calls: ICallRepository,
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

        for (const statusObj of (value.statuses ?? []) as MetaStatusObject[]) {
            try {
                await this.handleStatus(statusObj, metadata, fullPayload)
            } catch (err) {
                logger.error("Failed processing status event", { wacid: statusObj.id, err })
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
        const contactId = await this.resolveContactId(statusWaId, null)

        await this.callState.findOrCreate(statusObj.id, {
            phoneNumberId: metadata?.phone_number_id ?? "",
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
                const transitioned = await this.callState.transition(statusObj.id, CallStatus.ACTIVE, {
                    answeredAt: new Date(),
                    recordingEnabled: config.recording.recordingEnabled,
                })
                if (transitioned) {
                    const call = await this.calls.findByWacid(statusObj.id)
                    if (call) this.signaling.notifyOutboundActive(call)
                }
                break
            }
            case CallEventStatus.REJECTED: {
                const transitioned = await this.callState.transition(statusObj.id, CallStatus.REJECTED, {
                    endReason: EndReason.CUSTOMER_REJECTED,
                    endedAt: new Date(),
                    durationSeconds: 0,
                })
                if (transitioned) {
                    const call = await this.calls.findByWacid(statusObj.id)
                    if (call) this.signaling.notifyCallEnded(call, EndReason.CUSTOMER_REJECTED)
                }
                break
            }
        }
    }

    private async resolveContactId(phoneNumber: string, name: string | null): Promise<number | null> {
        if (!phoneNumber) return null
        const contact = await this.contacts.findOrCreate(phoneNumber, name)
        return contact.id
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
}
