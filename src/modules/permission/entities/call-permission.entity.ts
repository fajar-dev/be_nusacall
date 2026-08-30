import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm"
import type { Relation } from "typeorm"
import { Contact } from "../../contact/entities/contact.entity"
import { PermissionStatus } from "../enums/permission-status.enum"

@Entity("call_permissions")
@Index(["phoneNumberId", "contactId"], { unique: true })
export class CallPermission {
    @PrimaryGeneratedColumn()
    id!: number

    @Column({ name: "phone_number_id", length: 32 })
    phoneNumberId!: string

    @Index()
    @Column({ name: "contact_id" })
    contactId!: number

    @ManyToOne(() => Contact, { onDelete: "CASCADE" })
    @JoinColumn({ name: "contact_id" })
    contact?: Relation<Contact>

    @Column({ type: "enum", enum: PermissionStatus, default: PermissionStatus.NO_PERMISSION })
    status!: PermissionStatus

    @Column({ name: "expires_at", type: "datetime", nullable: true })
    expiresAt?: Date | null

    @Column({ name: "checked_at", type: "datetime" })
    checkedAt!: Date

    @Column({ name: "last_requested_at", type: "datetime", nullable: true })
    lastRequestedAt?: Date | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
