import { MetaClient } from "../../infrastructure/meta/meta.client"
import { NusawaClient, nusawaClient as defaultNusawaClient } from "../../infrastructure/nusawa/nusawa.client"
import { ICallPermissionRepository } from "./interfaces/call-permission.repository.interface"
import { CallPermission } from "./entities/call-permission.entity"
import { PermissionStatus } from "./enums/permission-status.enum"
import { config } from "../../config/config"
import { BadRequestException } from "../../core/exceptions/base"
import { ContactService } from "../contact/contact.service"
import type { MetaCallPermissionResponse } from "../../infrastructure/meta/meta.types"

export interface PermissionCheckResult {
    permission: CallPermission
    quota: MetaCallPermissionResponse["actions"] | null
}

export class PermissionService {
    constructor(
        private readonly repository: ICallPermissionRepository,
        private readonly metaClient: MetaClient,
        private readonly contacts: ContactService,
        private readonly nusawaClient: NusawaClient = defaultNusawaClient,
    ) {}

    async checkPermission(phoneNumberId: string, contactId: number): Promise<PermissionCheckResult> {
        const contact = await this.contacts.getById(contactId)
        const cached = await this.repository.findByContact(phoneNumberId, contactId)
        const now = new Date()
        const ttlMs = config.outbound.permissionCacheTtlSeconds * 1000
        if (cached && now.getTime() - cached.checkedAt.getTime() < ttlMs) {
            return { permission: cached, quota: null }
        }

        const meta = await this.metaClient.getCallPermission(phoneNumberId, contact.phoneNumber)
        const expiresAt = meta.permission.expiration_time ? new Date(meta.permission.expiration_time * 1000) : null
        const permission = await this.repository.upsertStatus(phoneNumberId, contactId, meta.permission.status as PermissionStatus, expiresAt, now)
        return { permission, quota: meta.actions }
    }

    async requestPermission(phoneNumberId: string, contactId: number): Promise<void> {
        const contact = await this.contacts.getById(contactId)
        if (!config.outbound.permissionTemplateName) {
            throw new BadRequestException("CALL_PERMISSION_TEMPLATE_NAME is not configured — create the template in Meta Business Manager first")
        }
        await this.nusawaClient.sendCallPermissionRequest(phoneNumberId, contact.phoneNumber)
        await this.repository.markRequested(phoneNumberId, contactId, new Date())
    }
}
