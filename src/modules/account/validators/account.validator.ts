import { z } from "zod"
import { CallIconVisibility } from "../enums/call-icon-visibility.enum"
import { TIMEZONES } from "../enums/timezone.enum"
import { CallHoursStatus } from "../enums/call-hours-status.enum"
import { DayOfWeek } from "../enums/day-of-week.enum"

const CallHoursValidator = z.object({
    status: z.enum(CallHoursStatus),
    timezone_id: z.enum(TIMEZONES),
    weekly_operating_hours: z.array(
        z.object({
            day_of_week: z.enum(DayOfWeek),
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

export const UpdateAccountValidator = z.object({
    label: z.string().min(1, "label is required").optional(),
    callingEnabled: z.boolean().optional(),
    callIconVisibility: z.enum(CallIconVisibility).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Format warna harus hex, contoh #6366F1").optional(),
    callHours: CallHoursValidator.nullable().optional(),
})
export type UpdateAccountValidator = z.infer<typeof UpdateAccountValidator>
