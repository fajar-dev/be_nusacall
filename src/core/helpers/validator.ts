import { ValidationException } from "../exceptions/base"
/** Zod validation hook for Hono's zValidator. */
export const validationHook = (result: any) => {
    if (!result.success) {
        throw new ValidationException(result.error)
    }
}