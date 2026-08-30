import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from "typeorm"
import type { Relation } from "typeorm"
import { Type } from "../enums/organization-type.enum"

@Entity("organizations")
export class Organization {
    @PrimaryGeneratedColumn()
    id!: number

    @Index()
    @Column({ name: "parent_id", nullable: true })
    parentId!: number | null

    @ManyToOne(() => Organization, (org) => org.children, { onDelete: "RESTRICT", nullable: true })
    @JoinColumn({ name: "parent_id" })
    parent?: Relation<Organization> | null

    @OneToMany(() => Organization, (org) => org.parent)
    children?: Relation<Organization[]>

    @Index()
    @Column()
    name!: string

    @Column({ type: "enum", enum: Type, default: Type.DIVISION })
    type!: Type

    @Column({ type: "text", nullable: true })
    description!: string | null

    @Column({ name: "is_active", default: true })
    isActive!: boolean

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}