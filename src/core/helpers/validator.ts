import { ValidationException } from "../exceptions/base"
/**
 * Standard Zod validation hook for Hono/zValidator.
 * Automatically throws a ValidationException if validation fails.
 */
export const validationHook = (result: any) => {
    if (!result.success) {
        throw new ValidationException(result.error)
    }
}