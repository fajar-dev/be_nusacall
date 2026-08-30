import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm"
import type { Relation } from "typeorm"
import { Call } from "./call.entity"

@Entity("call_recordings")
export class CallRecording {
    @PrimaryGeneratedColumn()
    id!: number

    @Index({ unique: true })
    @Column({ name: "call_id" })
    callId!: number

    @ManyToOne(() => Call, { onDelete: "CASCADE" })
    @JoinColumn({ name: "call_id" })
    call!: Relation<Call>

    @Index({ unique: true })
    @Column({ length: 128 })
    wacid!: string

    @Column({ name: "customer_s3_key", length: 255, nullable: true })
    customerS3Key?: string | null

    @Column({ name: "agent_s3_key", length: 255, nullable: true })
    agentS3Key?: string | null

    @Column({ name: "duration_seconds", type: "int", default: 0 })
    durationSeconds!: number

    @Column({ name: "recording_error", type: "text", nullable: true })
    recordingError?: string | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
