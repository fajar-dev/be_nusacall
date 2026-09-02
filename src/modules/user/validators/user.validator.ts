import { z } from "zod"

export const CreateUserValidator = z.object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().email("Invalid email format"),
    photo: z.string().trim().nullable().optional(),
    employeeId: z.coerce.number().int().positive("Employee id is required"),
    organizationId: z.number().int().positive().optional(),
})

export type CreateUserValidator = z.infer<typeof CreateUserValidator>

export const UpdateUserValidator = z.object({
    name: z.string().trim().min(1, "Name is required").optional(),
    email: z.string().trim().email("Invalid email format").optional(),
    photo: z.string().trim().nullable().optional(),
    employeeId: z.string().trim().min(1, "Employee code is required").optional(),
    organizationId: z.number().int().positive().optional(),
})

export type UpdateUserValidator = z.infer<typeof UpdateUserValidator>
