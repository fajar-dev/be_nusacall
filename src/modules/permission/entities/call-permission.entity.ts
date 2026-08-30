import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { PermissionStatus } from "../enums/permission-status.enum"

@Entity("call_permissions")
@Index(["phoneNumberId", "waId"], { unique: true })
export class CallPermission {
    @PrimaryGeneratedColumn()
    id!: number

    @Column({ name: "phone_number_id", length: 32 })
    phoneNumberId!: string

    @Column({ name: "wa_id", length: 32 })
    waId!: string

    @Column({ type: "enum", enum: PermissionStatus, default: PermissionStatus.NO_PERMISSION })
    status!: PermissionStatus

    @Column({ name: "expires_at", type: "datetime", nullable: true })
    expiresAt?: Date | null

    @Column({ name: "checked_at", type: "datetime" })
    checkedAt!: Date

    @Column({ name: "last_requested_at", type: "datetime", nullable: true })
    lastRequestedAt?: Date | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
