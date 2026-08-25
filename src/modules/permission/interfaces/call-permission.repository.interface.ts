import { CallPermission } from "../entities/call-permission.entity"
import { PermissionStatus } from "../enum/permission-status.enum"

export interface ICallPermissionRepository {
    findByContact(phoneNumberId: string, waId: string): Promise<CallPermission | null>
    upsertStatus(phoneNumberId: string, waId: string, status: PermissionStatus, expiresAt: Date | null, checkedAt: Date): Promise<CallPermission>
    markRequested(phoneNumberId: string, waId: string, requestedAt: Date): Promise<void>
}
