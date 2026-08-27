import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from "typeorm"

@Entity("contacts")
export class Contact {
    @PrimaryGeneratedColumn()
    id!: number

    @Index({ unique: true })
    @Column({ name: "wa_id", length: 32 })
    waId!: string

    @Column({ name: "profile_name", length: 128, nullable: true })
    profileName?: string | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
