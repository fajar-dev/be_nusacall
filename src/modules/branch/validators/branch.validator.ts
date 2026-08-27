import { z } from "zod"

export const CreateBranchValidator = z.object({
    code: z.string().trim().optional(),
    name: z.string().trim().min(1, "Name is required"),
    description: z.string().trim().optional(),
    address: z.string().trim().optional(),
    email: z.string().trim().email("Invalid email format").optional().or(z.literal("")),
    phone: z.string().trim().optional(),
})

export type CreateBranchValidator = z.infer<typeof CreateBranchValidator>

export const UpdateBranchValidator = z.object({
    code: z.string().trim().optional(),
    name: z.string().trim().min(1, "Name is required").optional(),
    description: z.string().trim().optional(),
    address: z.string().trim().optional(),
    email: z.string().trim().email("Invalid email format").optional().or(z.literal("")),
    phone: z.string().trim().optional(),
})

export type UpdateBranchValidator = z.infer<typeof UpdateBranchValidator>
