import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from "typeorm"

/**
 * Append-only log of every webhook from Meta. `dedupKey` (unique) guards
 * idempotency against Meta's duplicate deliveries; full payload is kept for audit/replay.
 */
@Entity("call_events")
@Index(["callId", "receivedAt"])
export class CallEvent {
    @PrimaryGeneratedColumn()
    id!: number

    @Index({ unique: true })
    @Column({ name: "dedup_key", length: 64 })
    dedupKey!: string

    @Index()
    @Column({ length: 128 })
    wacid!: string

    @Column({ name: "call_id", nullable: true })
    callId?: number | null

    @Column({ name: "event_type", length: 48 })
    eventType!: string // connect | status | terminate | recording | transcript

    @Column({ name: "event_status", length: 32, nullable: true })
    eventStatus?: string | null // RINGING | ACCEPTED | REJECTED

    @Column({ name: "meta_timestamp", type: "bigint", nullable: true })
    metaTimestamp?: string | null

    /** Payload mentah TANPA field session/sdp. */
    @Column({ type: "json" })
    payload!: Record<string, unknown>

    @Column({ name: "is_stale", default: false })
    isStale!: boolean

    @Column({ default: false })
    processed!: boolean

    @Column({ name: "processing_error", type: "text", nullable: true })
    processingError?: string | null

    @CreateDateColumn({ name: "received_at" })
    receivedAt!: Date
}
