import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { Salutation } from "../enum/salutation.enum"
import { ContactType } from "../enum/type.enum"

@Entity("contacts")
export class Contact {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    name!: string

    @Column({ type: "enum", enum: Salutation, default: null, nullable: true })
    salutation?: Salutation | null

    @Column({ nullable: true })
    email?: string

    @Column({ nullable: true })
    phone?: string

    @Column({ type: "enum", enum: ContactType, default: ContactType.CUSTOMER, nullable: false })
    type!: ContactType

    @Column({ name: "is_active", default: true, nullable: false })
    isActive!: boolean

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
