import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from "typeorm"

export enum QueueStatus {
    PENDING = "pending",
    SENT = "sent",
    FAILED = "failed",
    ABANDONED = "abandoned",
}

/**
 * Antrean penulisan log panggilan ke nusawa (POST /api/messages?no_send=1).
 * Fire-and-forget dengan retry — kegagalan TIDAK PERNAH mempengaruhi panggilan.
 * See: docs/INTEGRATION-NUSAWA.md §3.5
 */
@Entity("nusawa_log_queue")
export class NusawaLogQueue {
    @PrimaryGeneratedColumn()
    id!: number

    @Index()
    @Column({ name: "call_id" })
    callId!: number

    /** Correlates with nusawa's message `id`/`ref` — docs/INTEGRATION-NUSAWA.md §3.5. */
    @Column({ length: 128 })
    wacid!: string

    @Column({ name: "phone_number_id", length: 32 })
    phoneNumberId!: string

    @Column({ name: "wa_id", length: 32 })
    waId!: string

    @Column({ type: "text" })
    body!: string

    @Index()
    @Column({ type: "enum", enum: QueueStatus, default: QueueStatus.PENDING })
    status!: QueueStatus

    @Column({ type: "int", default: 0 })
    attempts!: number

    // precision: 3 (ms) — plain DATETIME rounds to the nearest second, which
    // can round a freshly-inserted "now" UP past the moment findDue() reads
    // it, making a just-enqueued row look not-due-yet nondeterministically.
    @Index()
    @Column({ name: "next_attempt_at", type: "datetime", precision: 3 })
    nextAttemptAt!: Date

    @Column({ name: "last_error", type: "text", nullable: true })
    lastError?: string | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date
}
