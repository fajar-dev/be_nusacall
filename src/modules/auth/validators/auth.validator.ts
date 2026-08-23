import { z } from 'zod'

export const LoginValidator = z.object({
  email: z.email("Email is required"),
  password: z.string().min(1, "Password is required"),
})

export type LoginValidator = z.infer<typeof LoginValidator>

export const GoogleLoginValidator = z.object({
  code: z.string().min(1, 'Code is required'),
})

export type GoogleLoginValidator = z.infer<typeof GoogleLoginValidator>