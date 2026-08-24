import { z } from "zod"

export const UpdateAgentValidator = z.object({
    canReceiveCalls: z.boolean(),
})
export type UpdateAgentValidator = z.infer<typeof UpdateAgentValidator>

export const SetAvailabilityValidator = z.object({
    availability: z.enum(["available", "busy", "away", "offline"]),
})
export type SetAvailabilityValidator = z.infer<typeof SetAvailabilityValidator>
