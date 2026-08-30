import { z } from "zod"

export const RequestOutboundCallValidator = z.object({
    phoneNumberId: z.string().min(1, "phoneNumberId is required"),
    contactId: z.coerce.number().int().positive("contactId is required"),
    offerSdp: z.string().min(1, "offerSdp is required"),
})
export type RequestOutboundCallValidator = z.infer<typeof RequestOutboundCallValidator>
