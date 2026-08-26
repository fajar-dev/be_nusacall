import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { CallIconVisibility } from "../enum/call-icon-visibility.enum"

@Entity("phone_numbers")
export class PhoneNumber {
    @PrimaryGeneratedColumn()
    id!: number

    @Index({ unique: true })
    @Column({ name: "phone_number_id", length: 32 })
    phoneNumberId!: string

    @Column({ name: "business_account_id", length: 32 })
    businessAccountId!: string

    @Column({ name: "display_phone_number", length: 32 })
    displayPhoneNumber!: string

    @Column({ length: 128 })
    label!: string

    @Column({ name: "is_test_number", default: false })
    isTestNumber!: boolean

    @Column({ name: "calling_enabled", default: false })
    callingEnabled!: boolean

    @Column({ name: "call_icon_visibility", type: "enum", enum: CallIconVisibility, default: CallIconVisibility.DEFAULT })
    callIconVisibility!: CallIconVisibility

    @Column({ length: 16, default: "#6366F1" })
    color!: string

    @Column({ name: "call_hours", type: "json", nullable: true })
    callHours?: Record<string, unknown> | null

    @Column({ name: "answer_timeout_seconds", type: "int", default: 20 })
    answerTimeoutSeconds!: number

    @Column({ name: "last_synced_at", type: "datetime", nullable: true })
    lastSyncedAt?: Date | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
