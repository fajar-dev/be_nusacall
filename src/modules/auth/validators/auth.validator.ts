import { z } from "zod"

export const LoginValidator = z.object({
    email: z.string().min(1, "email is required"),
    password: z.string().min(1, "password is required"),
})
export type LoginValidator = z.infer<typeof LoginValidator>

export const GoogleLoginValidator = z.object({
    code: z.string().min(1, "code is required"),
})
export type GoogleLoginValidator = z.infer<typeof GoogleLoginValidator>

export const RefreshTokenValidator = z.object({
  refreshToken: z.string().trim().min(1, "Refresh token is required"),
})

export type RefreshTokenValidator = z.infer<typeof RefreshTokenValidator>
