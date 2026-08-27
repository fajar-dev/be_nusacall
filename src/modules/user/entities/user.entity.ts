import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index, OneToMany } from "typeorm"
import type { Relation } from "typeorm"
import { Organization } from "../../organization/entities/organization.entity"
import { Branch } from "../../branch/entities/branch.entity"
import { Role } from "../enums/role.enum"

@Entity("users")
export class User {
    @PrimaryGeneratedColumn()
    id!: number

    @Index()
    @Column({ name: "organization_id", nullable: true })
    organizationId!: number | null

    @ManyToOne(() => Organization, { onDelete: "SET NULL", nullable: true })
    @JoinColumn({ name: "organization_id" })
    organization?: Relation<Organization> | null

    @Index()
    @Column({ name: "branch_id", nullable: true })
    branchId!: number | null

    @ManyToOne(() => Branch, { onDelete: "SET NULL", nullable: true })
    @JoinColumn({ name: "branch_id" })
    branch?: Relation<Branch> | null

    @Index()
    @Column({ name: "employee_id" })
    employeeId!: number

    @Index()
    @Column()
    name!: string

    @Column({ nullable: true })
    photo?: string

    @Column({ unique: true })
    email!: string

    @Column({ type: "enum", enum: Role, default: Role.AGENT })
    role!: Role

    @Index()
    @Column({ name: "is_active", default: true })
    isActive!: boolean

    @Column({ name: "last_seen_at", type: "datetime", nullable: true })
    lastSeenAt?: Date | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date

    @Index()
    @Column({ name: "deleted_at", type: "timestamp", nullable: true, default: null })
    deletedAt?: Date | null
}