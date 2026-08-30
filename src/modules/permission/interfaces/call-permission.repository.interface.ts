import { CallPermission } from "../entities/call-permission.entity"
import { PermissionStatus } from "../enums/permission-status.enum"

export interface ICallPermissionRepository {
    findByContact(phoneNumberId: string, contactId: number): Promise<CallPermission | null>
    upsertStatus(phoneNumberId: string, contactId: number, status: PermissionStatus, expiresAt: Date | null, checkedAt: Date): Promise<CallPermission>
    markRequested(phoneNumberId: string, contactId: number, requestedAt: Date): Promise<void>
}
