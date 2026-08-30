import { z } from "zod"

export const RequestPermissionValidator = z.object({
    phoneNumberId: z.string().min(1, "phoneNumberId is required"),
    contactId: z.coerce.number().int().positive("contactId is required"),
})
export type RequestPermissionValidator = z.infer<typeof RequestPermissionValidator>
