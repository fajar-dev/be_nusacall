import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm"
import type { Relation } from "typeorm"
import type { Timezone } from "../../account/enums/timezone.enum"
import { ContactBranch } from "./contact-branch.entity"

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

    @OneToMany(() => ContactBranch, (contactBranch) => contactBranch.contact)
    contactBranches?: Relation<ContactBranch>[]

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
