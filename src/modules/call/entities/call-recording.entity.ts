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

    @Column({ name: "s3_key", length: 255, nullable: true })
    s3Key?: string | null

    @Column({ name: "duration_seconds", type: "int", default: 0 })
    durationSeconds!: number

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
