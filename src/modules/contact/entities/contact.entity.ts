import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm"
import type { Relation } from "typeorm"
import { Branch } from "../../branch/entities/branch.entity"
import type { Timezone } from "../../account/enums/timezone.enum"

@Entity("contacts")
export class Contact {
    @PrimaryGeneratedColumn()
    id!: number

    @Index({ unique: true })
    @Column({ name: "phone_number", length: 32 })
    phoneNumber!: string

    @Column({ length: 128, nullable: true })
    name?: string | null

    @Column({ name: "time_zone", type: "varchar", length: 64, default: "UTC" })
    timeZone!: Timezone

    @Index()
    @Column({ name: "branch_id", nullable: true })
    branchId?: number | null

    @ManyToOne(() => Branch, { onDelete: "SET NULL", nullable: true })
    @JoinColumn({ name: "branch_id" })
    branch?: Relation<Branch> | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
