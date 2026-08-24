import { z } from "zod"

export const LoginValidator = z.object({
    email: z.string().min(1, "email is required"),
    password: z.string().min(1, "password is required"),
})
export type LoginValidator = z.infer<typeof LoginValidator>

export const GoogleLoginValidator = z.object({
    idToken: z.string().min(1, "idToken is required"),
})
export type GoogleLoginValidator = z.infer<typeof GoogleLoginValidator>
