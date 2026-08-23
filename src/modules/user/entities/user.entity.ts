import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"

@Entity("users")
export class User {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    name!: string

    @Column({ nullable: true })
    photo?: string

    @Column({ unique: true })
    email!: string

    @Column({ select: false, nullable: true })
    password?: string

    @Column({ name: "reset_password_token", nullable: true })
    resetPasswordToken?: string

    @Column({ name: "reset_password_expires", type: "timestamp", nullable: true })
    resetPasswordExpires?: Date

    @Column({ name: "is_active", default: true })
    isActive!: boolean

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}

