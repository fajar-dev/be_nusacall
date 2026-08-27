import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from "typeorm"

@Entity("branches")
export class Branch {
    @PrimaryGeneratedColumn()
    id!: number

    @Column({ unique: true })
    code!: string

    @Index()
    @Column()
    name!: string

    @Column({ nullable: true, type: "text" })
    description?: string

    @Column({ nullable: true, type: "text" })
    address?: string

    @Column({ nullable: true })
    email?: string

    @Column({ nullable: true })
    phone?: string

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
