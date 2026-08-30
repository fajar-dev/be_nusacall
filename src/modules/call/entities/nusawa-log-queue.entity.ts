import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm"
import type { Relation } from "typeorm"
import { QueueStatus } from "../enums/queue-status.enum"
import { Call } from "./call.entity"

@Entity("nusawa_log_queue")
@Index(["status", "nextAttemptAt"])
export class NusawaLogQueue {
    @PrimaryGeneratedColumn()
    id!: number

    @Index()
    @Column({ name: "call_id" })
    callId!: number

    @ManyToOne(() => Call, { onDelete: "CASCADE" })
    @JoinColumn({ name: "call_id" })
    call!: Relation<Call>

    @Column({ length: 128 })
    wacid!: string

    @Column({ name: "phone_number_id", length: 32 })
    phoneNumberId!: string

    @Column({ name: "wa_id", length: 32 })
    waId!: string

    @Column({ type: "text" })
    body!: string

    @Column({ type: "enum", enum: QueueStatus, default: QueueStatus.PENDING })
    status!: QueueStatus

    @Column({ type: "int", default: 0 })
    attempts!: number

    @Column({ name: "next_attempt_at", type: "datetime", precision: 3 })
    nextAttemptAt!: Date

    @Column({ name: "last_error", type: "text", nullable: true })
    lastError?: string | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date
}
