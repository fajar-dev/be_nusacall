import { MetaClient } from "../../infrastructure/meta/meta.client"
import { ICallPermissionRepository } from "./interfaces/call-permission.repository.interface"
import { CallPermission } from "./entities/call-permission.entity"
import { PermissionStatus } from "./enum/permission-status.enum"
import { config } from "../../config/config"
import { BadRequestException } from "../../core/exceptions/base"
import type { MetaCallPermissionResponse } from "../../infrastructure/meta/meta.types"

export interface PermissionCheckResult {
    permission: CallPermission
    /** Only populated on a fresh Meta check (not served from cache) — live usage numbers aren't worth persisting. */
    quota: MetaCallPermissionResponse["actions"] | null
}

/**
 * Cached per `permissionCacheTtlSeconds` — Meta rate-limits the check endpoint (error 613),
 * so this isn't just an optimization; hammering it without a cache will get us throttled.
 */
export class PermissionService {
    constructor(
        private readonly repository: ICallPermissionRepository,
        private readonly metaClient: MetaClient,
    ) {}

    async checkPermission(phoneNumberId: string, waId: string): Promise<PermissionCheckResult> {
        const cached = await this.repository.findByContact(phoneNumberId, waId)
        const now = new Date()
        const ttlMs = config.outbound.permissionCacheTtlSeconds * 1000
        if (cached && now.getTime() - cached.checkedAt.getTime() < ttlMs) {
            return { permission: cached, quota: null }
        }

        const meta = await this.metaClient.getCallPermission(phoneNumberId, waId)
        const expiresAt = meta.permission.expiration_time ? new Date(meta.permission.expiration_time * 1000) : null
        const permission = await this.repository.upsertStatus(phoneNumberId, waId, meta.permission.status as PermissionStatus, expiresAt, now)
        return { permission, quota: meta.actions }
    }

    /** Sends the VOICE_CALL_REQUEST template — the one place NusaCall sends a real outbound WhatsApp message. */
    async requestPermission(phoneNumberId: string, waId: string): Promise<void> {
        if (!config.outbound.permissionTemplateName) {
            throw new BadRequestException("CALL_PERMISSION_TEMPLATE_NAME is not configured — create the template in Meta Business Manager first")
        }
        await this.metaClient.sendCallPermissionRequest(phoneNumberId, waId)
        await this.repository.markRequested(phoneNumberId, waId, new Date())
    }
}
