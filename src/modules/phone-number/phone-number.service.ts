import { IPhoneNumberRepository } from "./interfaces/phone-number.repository.interface"
import { PhoneNumber } from "./entities/phone-number.entity"
import { CallIconVisibility } from "./enum/call-icon-visibility.enum"
import { MetaClient } from "../../infrastructure/meta/meta.client"
import { NotFoundException } from "../../core/exceptions/base"
import { logger } from "../../core/helpers/logger"
import type { MetaHealthStatusResponse } from "../../infrastructure/meta/meta.types"

export interface UpdatePhoneNumberInput {
    label?: string
    callingEnabled?: boolean
    callIconVisibility?: CallIconVisibility
    color?: string
    answerTimeoutSeconds?: number
    callHours?: Record<string, unknown> | null
}

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

    async update(id: number, input: UpdatePhoneNumberInput): Promise<PhoneNumber> {
        const existing = await this.getById(id)
        const merged = this.repository.merge(existing, input as Partial<PhoneNumber>)
        const saved = await this.repository.save(merged)
        return await this.syncToMeta(saved)
    }

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
            logger.error("Failed to sync phone number settings to Meta", { phoneNumberId: phoneNumber.phoneNumberId, err })
            throw err
        }

        const withSyncStamp = this.repository.merge(phoneNumber, { lastSyncedAt: new Date() })
        return await this.repository.save(withSyncStamp)
    }
}
