import { Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { CallPermission } from "../entities/call-permission.entity"
import { PermissionStatus } from "../enums/permission-status.enum"
import { ICallPermissionRepository } from "../interfaces/call-permission.repository.interface"

export class TypeOrmCallPermissionRepository implements ICallPermissionRepository {
    private readonly repository: Repository<CallPermission>

    constructor() {
        this.repository = AppDataSource.getRepository(CallPermission)
    }

    async findByContact(phoneNumberId: string, contactId: number): Promise<CallPermission | null> {
        return this.repository.findOne({ where: { phoneNumberId, contactId } })
    }

    async upsertStatus(phoneNumberId: string, contactId: number, status: PermissionStatus, expiresAt: Date | null, checkedAt: Date): Promise<CallPermission> {
        const existing = await this.findByContact(phoneNumberId, contactId)
        if (existing) {
            existing.status = status
            existing.expiresAt = expiresAt
            existing.checkedAt = checkedAt
            return this.repository.save(existing)
        }
        try {
            return await this.repository.save(this.repository.create({ phoneNumberId, contactId, status, expiresAt, checkedAt }))
        } catch (err) {
            if (this.isUniqueViolation(err)) {
                const winner = await this.findByContact(phoneNumberId, contactId)
                if (winner) {
                    winner.status = status
                    winner.expiresAt = expiresAt
                    winner.checkedAt = checkedAt
                    return this.repository.save(winner)
                }
            }
            throw err
        }
    }

    async markRequested(phoneNumberId: string, contactId: number, requestedAt: Date): Promise<void> {
        const existing = await this.findByContact(phoneNumberId, contactId)
        if (existing) {
            await this.repository.update(existing.id, { lastRequestedAt: requestedAt })
            return
        }
        await this.repository.save(this.repository.create({
            phoneNumberId, contactId, status: PermissionStatus.NO_PERMISSION,
            checkedAt: requestedAt, lastRequestedAt: requestedAt,
        }))
    }

    private isUniqueViolation(err: unknown): boolean {
        const code = (err as { code?: string })?.code
        return code === "ER_DUP_ENTRY"
    }
}
