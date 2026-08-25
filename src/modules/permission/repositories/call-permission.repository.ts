import { Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { CallPermission } from "../entities/call-permission.entity"
import { PermissionStatus } from "../enum/permission-status.enum"
import { ICallPermissionRepository } from "../interfaces/call-permission.repository.interface"

export class TypeOrmCallPermissionRepository implements ICallPermissionRepository {
    private readonly repository: Repository<CallPermission>

    constructor() {
        this.repository = AppDataSource.getRepository(CallPermission)
    }

    async findByContact(phoneNumberId: string, waId: string): Promise<CallPermission | null> {
        return this.repository.findOne({ where: { phoneNumberId, waId } })
    }

    async upsertStatus(phoneNumberId: string, waId: string, status: PermissionStatus, expiresAt: Date | null, checkedAt: Date): Promise<CallPermission> {
        const existing = await this.findByContact(phoneNumberId, waId)
        if (existing) {
            existing.status = status
            existing.expiresAt = expiresAt
            existing.checkedAt = checkedAt
            return this.repository.save(existing)
        }
        try {
            return await this.repository.save(this.repository.create({ phoneNumberId, waId, status, expiresAt, checkedAt }))
        } catch (err) {
            if (this.isUniqueViolation(err)) {
                const winner = await this.findByContact(phoneNumberId, waId)
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

    async markRequested(phoneNumberId: string, waId: string, requestedAt: Date): Promise<void> {
        const existing = await this.findByContact(phoneNumberId, waId)
        if (existing) {
            await this.repository.update(existing.id, { lastRequestedAt: requestedAt })
            return
        }
        await this.repository.save(this.repository.create({
            phoneNumberId, waId, status: PermissionStatus.NO_PERMISSION,
            checkedAt: requestedAt, lastRequestedAt: requestedAt,
        }))
    }

    private isUniqueViolation(err: unknown): boolean {
        const code = (err as { code?: string })?.code
        return code === "ER_DUP_ENTRY"
    }
}
