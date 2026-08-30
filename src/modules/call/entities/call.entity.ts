import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm"
import type { Relation } from "typeorm"
import { CallStatus, CALL_STATUS_RANK } from "../enums/call-status.enum"
import { CallDirection } from "../enums/call-direction.enum"
import { EndReason } from "../enums/end-reason.enum"
import { User } from "../../user/entities/user.entity"
import { Contact } from "../../contact/entities/contact.entity"

@Entity("calls")
@Index(["status", "createdAt"])
export class Call {
    @PrimaryGeneratedColumn()
    id!: number

    @Index({ unique: true })
    @Column({ length: 128 })
    wacid!: string

    @Index()
    @Column({ name: "phone_number_id", length: 32 })
    phoneNumberId!: string

    @Column({ name: "display_phone_number", length: 32, nullable: true })
    displayPhoneNumber?: string | null

    @Index()
    @Column({ name: "wa_id", length: 32 })
    waId!: string

    @Column({ name: "profile_name", length: 128, nullable: true })
    profileName?: string | null

    @Column({ name: "contact_name", length: 128, nullable: true })
    contactName?: string | null

    @Index()
    @Column({ name: "contact_id", nullable: true })
    contactId?: number | null

    @ManyToOne(() => Contact, { onDelete: "SET NULL", nullable: true })
    @JoinColumn({ name: "contact_id" })
    contact?: Relation<Contact> | null

    @Index()
    @Column({ name: "user_id", nullable: true })
    userId?: number | null

    @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
    @JoinColumn({ name: "user_id" })
    user?: Relation<User> | null

    @Column({ type: "enum", enum: CallDirection })
    direction!: CallDirection

    @Index()
    @Column({ type: "enum", enum: CallStatus, default: CallStatus.PENDING })
    status!: CallStatus

    @Column({ name: "status_rank", type: "smallint", default: CALL_STATUS_RANK[CallStatus.PENDING] })
    statusRank!: number

    @Column({ name: "end_reason", type: "enum", enum: EndReason, nullable: true })
    endReason?: EndReason | null

    @Column({ name: "error_code", type: "int", nullable: true })
    errorCode?: number | null

    @Column({ name: "error_message", type: "text", nullable: true })
    errorMessage?: string | null

    @Column({ name: "ringing_at", type: "datetime", nullable: true })
    ringingAt?: Date | null

    @Column({ name: "answered_at", type: "datetime", nullable: true })
    answeredAt?: Date | null

    @Column({ name: "ended_at", type: "datetime", nullable: true })
    endedAt?: Date | null

    @Column({ name: "duration_seconds", type: "int", nullable: true })
    durationSeconds?: number | null

    @Column({ name: "setup_duration_ms", type: "int", nullable: true })
    setupDurationMs?: number | null

    @Column({ name: "recording_enabled", default: false })
    recordingEnabled!: boolean

    @Column({ name: "transcription_enabled", default: false })
    transcriptionEnabled!: boolean

    @Index()
    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
