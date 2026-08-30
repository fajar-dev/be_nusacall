import { z } from "zod"
import { TIMEZONES } from "../../account/enums/timezone.enum"
import { normalizePhoneNumber } from "../../../core/helpers/phone-number"

const phoneNumber = z.string()
    .trim()
    .transform(normalizePhoneNumber)
    .refine((value) => /^[0-9]{6,20}$/.test(value), "Nomor telepon harus 6-20 digit angka")

export const CreateContactValidator = z.object({
    phoneNumber,
    name: z.string().trim().min(1).max(128).optional().nullable(),
    timeZone: z.enum(TIMEZONES).optional(),
    branchId: z.coerce.number().int().positive().optional().nullable(),
})
export type CreateContactValidator = z.infer<typeof CreateContactValidator>

export const UpdateContactValidator = z.object({
    phoneNumber: phoneNumber.optional(),
    name: z.string().trim().min(1).max(128).optional().nullable(),
    timeZone: z.enum(TIMEZONES).optional(),
    branchId: z.coerce.number().int().positive().optional().nullable(),
})
export type UpdateContactValidator = z.infer<typeof UpdateContactValidator>
