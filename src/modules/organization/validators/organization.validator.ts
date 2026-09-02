import { z } from "zod"
import { OrganizationType } from "../enums/organization-type.enum"

export const CreateOrganizationValidator = z.object({
    name: z.string().trim().min(1, "Name is required"),
    type: z.enum(OrganizationType),
    description: z.string().trim().optional().nullable(),
    parentId: z.number().int().positive().optional().nullable(),
    isActive: z.boolean().optional(),
})

export type CreateOrganizationValidator = z.infer<typeof CreateOrganizationValidator>

export const UpdateOrganizationValidator = z.object({
    name: z.string().trim().min(1, "Name is required").optional(),
    type: z.enum(OrganizationType).optional(),
    description: z.string().trim().optional().nullable(),
    parentId: z.number().int().positive().optional().nullable(),
    isActive: z.boolean().optional(),
})

export type UpdateOrganizationValidator = z.infer<typeof UpdateOrganizationValidator>
