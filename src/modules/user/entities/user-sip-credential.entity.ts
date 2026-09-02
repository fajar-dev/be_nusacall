import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm"
import type { Relation } from "typeorm"
import { User } from "./user.entity"

/**
 * Kredensial SIP milik tiap agent, dipakai softphone browser untuk mendaftar ke
 * Asterisk lewat WebSocket. Password disimpan apa adanya karena Asterisk perlu
 * mencocokkannya dengan digest auth dan browser perlu menerimanya saat login —
 * keduanya mustahil dengan hash satu arah.
 */
@Entity("user_sip_credentials")
export class UserSipCredential {
    @PrimaryGeneratedColumn()
    id!: number

    @Index({ unique: true })
    @Column({ name: "user_id" })
    userId!: number

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user!: Relation<User>

    @Index({ unique: true })
    @Column({ length: 64 })
    username!: string

    @Column({ length: 128 })
    password!: string

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
