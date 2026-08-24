import { z } from "zod"

export const RequestPermissionValidator = z.object({
    phoneNumberId: z.string().min(1, "phoneNumberId is required"),
    waId: z.string().min(1, "waId is required"),
})
export type RequestPermissionValidator = z.infer<typeof RequestPermissionValidator>
