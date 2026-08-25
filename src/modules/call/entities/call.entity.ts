import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { CallStatus, CALL_STATUS_RANK } from "../enum/call-status.enum"
import { CallDirection } from "../enum/call-direction.enum"
import { EndReason } from "../enum/end-reason.enum"

@Entity("calls")
export class Call {
    @PrimaryGeneratedColumn()
    id!: number

    // ── Identitas Meta ──────────────────────────────────────────────
    @Index({ unique: true })
    @Column({ length: 128 })
    wacid!: string

    @Column({ name: "phone_number_id", length: 32 })
    phoneNumberId!: string

    @Column({ name: "business_account_id", length: 32, nullable: true })
    businessAccountId?: string | null

    @Column({ name: "display_phone_number", length: 32, nullable: true })
    displayPhoneNumber?: string | null

    // ── Pihak lawan ─────────────────────────────────────────────────
    @Index()
    @Column({ name: "wa_id", length: 32 })
    waId!: string

    @Column({ name: "profile_name", length: 128, nullable: true })
    profileName?: string | null

    @Column({ name: "contact_name", length: 128, nullable: true })
    contactName?: string | null

    @Index()
    @Column({ name: "agent_email", length: 128, nullable: true })
    agentEmail?: string | null

    // ── Status ──────────────────────────────────────────────────────
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

    // ── Linimasa ────────────────────────────────────────────────────
    @Column({ name: "connected_webhook_at", type: "datetime", nullable: true })
    connectedWebhookAt?: Date | null

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

    // ── Atribusi ────────────────────────────────────────────────────
    @Column({ name: "cta_payload", type: "text", nullable: true })
    ctaPayload?: string | null

    @Column({ name: "deeplink_payload", type: "text", nullable: true })
    deeplinkPayload?: string | null

    @Column({ name: "biz_opaque_callback_data", length: 512, nullable: true })
    bizOpaqueCallbackData?: string | null

    // ── Bendera ─────────────────────────────────────────────────────
    @Column({ name: "recording_enabled", default: false })
    recordingEnabled!: boolean

    @Column({ name: "transcription_enabled", default: false })
    transcriptionEnabled!: boolean

    @Column({ name: "nusawa_logged", default: false })
    nusawaLogged!: boolean

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
