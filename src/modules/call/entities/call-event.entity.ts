import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm"
import type { Relation } from "typeorm"
import { Call } from "./call.entity"
import { CallEventType } from "../enums/call-event-type.enum"
import { CallEventStatus } from "../enums/call-event-status.enum"

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

    @ManyToOne(() => Call, { onDelete: "CASCADE", nullable: true })
    @JoinColumn({ name: "call_id" })
    call?: Relation<Call> | null

    @Column({ name: "event_type", type: "enum", enum: CallEventType })
    eventType!: CallEventType

    @Column({ name: "event_status", type: "enum", enum: CallEventStatus, nullable: true })
    eventStatus?: CallEventStatus | null

    @Column({ name: "meta_timestamp", type: "bigint", nullable: true })
    metaTimestamp?: string | null

    @Column({ type: "json" })
    payload!: Record<string, unknown>

    @Column({ name: "is_stale", default: false })
    isStale!: boolean


    @CreateDateColumn({ name: "received_at" })
    receivedAt!: Date
}
