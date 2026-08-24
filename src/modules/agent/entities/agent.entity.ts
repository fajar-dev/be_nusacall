import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from "typeorm"

/**
 * Roster agent. Identitas (username, role) berasal dari nusawa dan disimpan
 * sebagai snapshot saat login. Presence (online/available) TIDAK disimpan
 * di sini — bersifat efemeral, hidup di memori (lihat PresenceRegistry).
 */
@Entity("agents")
export class Agent {
    @PrimaryGeneratedColumn()
    id!: number

    @Index({ unique: true })
    @Column({ length: 128 })
    username!: string

    @Column({ name: "display_name", length: 128, nullable: true })
    displayName?: string | null

    @Column({ length: 32, nullable: true })
    role?: string | null

    @Column({ name: "can_receive_calls", default: true })
    canReceiveCalls!: boolean

    @Column({ name: "last_seen_at", type: "datetime", nullable: true })
    lastSeenAt?: Date | null

    @Column({ name: "total_calls_handled", type: "int", default: 0 })
    totalCallsHandled!: number

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
