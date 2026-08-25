import { IPhoneNumberRepository } from "./interfaces/phone-number.repository.interface"
import { PhoneNumber } from "./entities/phone-number.entity"
import { MetaClient } from "../../infrastructure/meta/meta.client"
import { NotFoundException } from "../../core/exceptions/base"
import { logger } from "../../core/helpers/logger"
import type { MetaHealthStatusResponse } from "../../infrastructure/meta/meta.types"

export interface UpdatePhoneNumberInput {
    label?: string
    callingEnabled?: boolean
    callIconVisibility?: string
    answerTimeoutSeconds?: number
    callHours?: Record<string, unknown> | null
    callerWhitelist?: string[]
}

/**
 * Owns phone number config and its sync to Meta. `call_hours` is a REPLACE, not a merge, on
 * Meta's side — so every sync always sends the full local config, never a partial update.
 */
export class PhoneNumberService {
    constructor(
        private readonly repository: IPhoneNumberRepository,
        private readonly metaClient: MetaClient,
    ) {}

    async getAll(page: number, limit: number): Promise<{ data: PhoneNumber[]; total: number }> {
        return await this.repository.findAll(page, limit)
    }

    async getById(id: number): Promise<PhoneNumber> {
        const phoneNumber = await this.repository.findById(id)
        if (!phoneNumber) throw new NotFoundException("Phone number not found")
        return phoneNumber
    }

    /** Saves locally, then pushes the FULL config to Meta — never a partial update. */
    async update(id: number, input: UpdatePhoneNumberInput): Promise<PhoneNumber> {
        const existing = await this.getById(id)
        const merged = this.repository.merge(existing, input as Partial<PhoneNumber>)
        const saved = await this.repository.save(merged)
        return await this.syncToMeta(saved)
    }

    /** Re-pushes the current local config to Meta without changing it — e.g. after a manual fix on Meta's side. */
    async sync(id: number): Promise<PhoneNumber> {
        const phoneNumber = await this.getById(id)
        return await this.syncToMeta(phoneNumber)
    }

    async getHealth(id: number): Promise<MetaHealthStatusResponse> {
        const phoneNumber = await this.getById(id)
        return await this.metaClient.getHealthStatus(phoneNumber.phoneNumberId)
    }

    private async syncToMeta(phoneNumber: PhoneNumber): Promise<PhoneNumber> {
        try {
            await this.metaClient.updateCallSettings(phoneNumber.phoneNumberId, {
                status: phoneNumber.callingEnabled ? "ENABLED" : "DISABLED",
                call_icon_visibility: phoneNumber.callIconVisibility,
                ...(phoneNumber.callHours ? { call_hours: phoneNumber.callHours } : {}),
            })
        } catch (err) {
            // Local config is already saved — Meta propagation can be retried
            // via the sync button. Don't lose the admin's edit over a blip.
            logger.error("Failed to sync phone number settings to Meta", { phoneNumberId: phoneNumber.phoneNumberId, err })
            throw err
        }

        const withSyncStamp = this.repository.merge(phoneNumber, { lastSyncedAt: new Date() })
        return await this.repository.save(withSyncStamp)
    }
}
