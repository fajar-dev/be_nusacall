import { Entity, PrimaryColumn, Index, ManyToOne, JoinColumn } from "typeorm"
import type { Relation } from "typeorm"
import { Contact } from "./contact.entity"
import { Branch } from "../../branch/entities/branch.entity"

@Entity("contact_branches")
export class ContactBranch {
    @PrimaryColumn({ name: "contact_id" })
    contactId!: number

    @Index()
    @PrimaryColumn({ name: "branch_id" })
    branchId!: number

    @ManyToOne(() => Contact, { onDelete: "CASCADE" })
    @JoinColumn({ name: "contact_id" })
    contact!: Relation<Contact>

    @ManyToOne(() => Branch, { onDelete: "CASCADE" })
    @JoinColumn({ name: "branch_id" })
    branch!: Relation<Branch>
}
