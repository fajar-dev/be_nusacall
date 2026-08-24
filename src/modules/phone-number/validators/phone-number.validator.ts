import { z } from "zod"

const CallHoursValidator = z.object({
    status: z.enum(["ENABLED", "DISABLED"]),
    timezone_id: z.string().min(1),
    weekly_operating_hours: z.array(
        z.object({
            day_of_week: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
            open_time: z.string().regex(/^\d{4}$/, "Format HHmm, contoh 0800"),
            close_time: z.string().regex(/^\d{4}$/, "Format HHmm, contoh 1700"),
        })
    ),
    holiday_schedule: z
        .array(
            z.object({
                date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
                start_time: z.string().regex(/^\d{4}$/),
                end_time: z.string().regex(/^\d{4}$/),
            })
        )
        .optional(),
})

export const UpdatePhoneNumberValidator = z.object({
    label: z.string().min(1, "label is required").optional(),
    callingEnabled: z.boolean().optional(),
    callIconVisibility: z.enum(["DEFAULT", "DISABLE_ALL"]).optional(),
    answerTimeoutSeconds: z.number().int().min(5).max(25).optional(),
    callHours: CallHoursValidator.nullable().optional(),
    callerWhitelist: z.array(z.string()).optional(),
})
export type UpdatePhoneNumberValidator = z.infer<typeof UpdatePhoneNumberValidator>
