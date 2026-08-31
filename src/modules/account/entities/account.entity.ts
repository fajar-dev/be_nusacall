import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { CallIconVisibility } from "../enums/call-icon-visibility.enum"

@Entity("accounts")
export class Account {
    @PrimaryGeneratedColumn()
    id!: number

    @Column({ name: "app_id", length: 32, nullable: true })
    appId?: string | null

    @Index({ unique: true })
    @Column({ name: "phone_number_id", length: 32 })
    phoneNumberId!: string

    @Column({ name: "business_account_id", length: 32 })
    businessAccountId!: string

    @Column({ name: "display_phone_number", length: 32 })
    displayPhoneNumber!: string

    @Column({ length: 128 })
    label!: string

    @Column({ name: "calling_enabled", default: false })
    callingEnabled!: boolean

    @Column({ name: "call_icon_visibility", type: "enum", enum: CallIconVisibility, default: CallIconVisibility.DEFAULT })
    callIconVisibility!: CallIconVisibility

    @Column({ length: 16, default: "#6366F1" })
    color!: string

    @Column({ name: "permission_template_name", length: 128, nullable: true })
    permissionTemplateName?: string | null

    @Column({ name: "permission_template_language", length: 16, nullable: true })
    permissionTemplateLanguage?: string | null

    @Column({ name: "call_hours", type: "json", nullable: true })
    callHours?: Record<string, unknown> | null

    @Column({ name: "last_synced_at", type: "datetime", nullable: true })
    lastSyncedAt?: Date | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
