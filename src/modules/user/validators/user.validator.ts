import { z } from "zod"

export const CreateUserValidator = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    photo: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
})

export type CreateUserValidator = z.infer<typeof CreateUserValidator>

export const UpdateUserValidator = z.object({
    name: z.string().min(1, "Name is required").optional(),
    email: z.string().email("Invalid email format").optional(),
    password: z.string().min(6, "Password must be at least 6 characters").optional(),
    photo: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
})

export type UpdateUserValidator = z.infer<typeof UpdateUserValidator>
