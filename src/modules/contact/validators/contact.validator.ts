import { z } from "zod"
import { Salutation } from "../enum/salutation.enum"
import { ContactType } from "../enum/type.enum"

export const CreateContactValidator = z.object({
    name: z.string().min(1, "Name is required"),
    salutation: z.enum(Salutation).nullable().optional(),
    email: z.email("Invalid email format").optional(),
    phone: z.string().optional(),
    type: z.enum(ContactType).default(ContactType.CUSTOMER),
    isActive: z.boolean().default(true),
})

export type CreateContactValidator = z.infer<typeof CreateContactValidator>

export const UpdateContactValidator = z.object({
    name: z.string().min(1, "Name is required"),
    salutation: z.enum(Salutation).nullable().optional(),
    email: z.email("Invalid email format").nullable().optional(),
    phone: z.string().nullable().optional(),
    type: z.enum(ContactType).optional(),
    isActive: z.boolean().optional(),
})

export type UpdateContactValidator = z.infer<typeof UpdateContactValidator>
