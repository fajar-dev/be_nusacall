import { z } from "zod"
import { TIMEZONES } from "../../account/enums/timezone.enum"

export const CreateContactValidator = z.object({
    phoneNumber: z.string().trim().regex(/^[0-9]{6,20}$/, "Nomor telepon harus 6-20 digit angka"),
    name: z.string().trim().min(1).max(128).optional().nullable(),
    timeZone: z.enum(TIMEZONES).optional(),
    branchId: z.coerce.number().int().positive().optional().nullable(),
})
export type CreateContactValidator = z.infer<typeof CreateContactValidator>

export const UpdateContactValidator = z.object({
    phoneNumber: z.string().trim().regex(/^[0-9]{6,20}$/, "Nomor telepon harus 6-20 digit angka").optional(),
    name: z.string().trim().min(1).max(128).optional().nullable(),
    timeZone: z.enum(TIMEZONES).optional(),
    branchId: z.coerce.number().int().positive().optional().nullable(),
})
export type UpdateContactValidator = z.infer<typeof UpdateContactValidator>
