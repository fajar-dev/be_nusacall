import { ValidationException } from "../exceptions/base"
export const validationHook = (result: any) => {
    if (!result.success) {
        throw new ValidationException(result.error)
    }
}
