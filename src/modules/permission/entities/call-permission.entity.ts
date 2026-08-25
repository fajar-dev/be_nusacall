import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { PermissionStatus } from "../enum/permission-status.enum"


/**
 * Local cache of Meta's call_permissions status per (phoneNumberId, waId) pair. Meta rate-limits
 * this check itself (error 613), so PermissionService checks here first and only calls Meta again once `checkedAt` is stale.
 */
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

    /** Meta's own expiration_time for a TEMPORARY grant — null for PERMANENT or NO_PERMISSION. */
    @Column({ name: "expires_at", type: "datetime", nullable: true })
    expiresAt?: Date | null

    /** Last time we actually asked Meta — drives our own 60s cache TTL. */
    @Column({ name: "checked_at", type: "datetime" })
    checkedAt!: Date

    /** Last time WE sent a permission request template — enforced client-side ahead of Meta's own 138009 rate limit for a better error message. */
    @Column({ name: "last_requested_at", type: "datetime", nullable: true })
    lastRequestedAt?: Date | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
