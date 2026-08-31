import { IAccountRepository } from "./interfaces/account.repository.interface"
import { Account } from "./entities/account.entity"
import { CallIconVisibility } from "./enums/call-icon-visibility.enum"
import { MetaClient } from "../../infrastructure/meta/meta.client"
import { NotFoundException } from "../../core/exceptions/base"
import { logger } from "../../core/helpers/logger"
import type { MetaHealthStatusResponse } from "../../infrastructure/meta/meta.types"

export interface UpdateAccountInput {
    label?: string
    callingEnabled?: boolean
    callIconVisibility?: CallIconVisibility
    color?: string
    permissionTemplateName?: string | null
    permissionTemplateLanguage?: string | null
    callHours?: Record<string, unknown> | null
}

export class AccountService {
    constructor(
        private readonly repository: IAccountRepository,
        private readonly metaClient: MetaClient,
    ) {}

    async getAll(page: number, limit: number): Promise<{ data: Account[]; total: number }> {
        return await this.repository.findAll(page, limit)
    }

    async getById(id: number): Promise<Account> {
        const account = await this.repository.findById(id)
        if (!account) throw new NotFoundException("Account not found")
        return account
    }

    async update(id: number, input: UpdateAccountInput): Promise<Account> {
        const existing = await this.getById(id)
        const merged = this.repository.merge(existing, input as Partial<Account>)
        const saved = await this.repository.save(merged)
        return await this.syncToMeta(saved)
    }

    async sync(id: number): Promise<Account> {
        const account = await this.getById(id)
        return await this.syncToMeta(account)
    }

    /** Hanya template yang sudah disetujui Meta yang dapat dipakai mengirim pesan. */
    async listTemplates(id: number) {
        const account = await this.getById(id)
        const response = await this.metaClient.listMessageTemplates(account.phoneNumberId, account.businessAccountId)
        return response.data
            .filter((template) => template.status === "APPROVED")
            .map((template) => ({ name: template.name, language: template.language, category: template.category ?? null }))
    }

    async getHealth(id: number): Promise<MetaHealthStatusResponse> {
        const account = await this.getById(id)
        return await this.metaClient.getHealthStatus(account.phoneNumberId)
    }

    private async syncToMeta(account: Account): Promise<Account> {
        try {
            await this.metaClient.updateCallSettings(account.phoneNumberId, {
                status: account.callingEnabled ? "ENABLED" : "DISABLED",
                call_icon_visibility: account.callIconVisibility,
                ...(account.callHours ? { call_hours: account.callHours } : {}),
            })
        } catch (err) {
            logger.error("Failed to sync account settings to Meta", { phoneNumberId: account.phoneNumberId, err })
            throw err
        }

        const withSyncStamp = this.repository.merge(account, { lastSyncedAt: new Date() })
        return await this.repository.save(withSyncStamp)
    }
}
