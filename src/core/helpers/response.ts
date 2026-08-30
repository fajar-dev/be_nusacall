import { Context } from "hono"
import { ContentfulStatusCode } from "hono/utils/http-status"
import { translate } from "./i18n"

function translateErrors(c: Context, errors: any) {
    if (!Array.isArray(errors)) return errors

    return errors.map((error) =>
        error && typeof error === "object" && typeof error.message === "string"
            ? { ...error, message: translate(c, error.message) }
            : error
    )
}

export class ApiResponse {
    static success<T>(
        c: Context,
        data: T,
        message: string = "Success",
        status: number = 200,
        meta?: any
    ) {
        return c.json({
            success: true,
            statusCode: status,
            message: translate(c, message),
            data: data,
            ...(meta && { meta })
        }, status as ContentfulStatusCode)
    }

    static paginate<T>(
        c: Context,
        data: T,
        total: number,
        page: number,
        limit: number,
        message: string = "Success"
    ) {
        const lastPage = Math.ceil(total / limit)

        return c.json({
            success: true,
            statusCode: 200,
            message: translate(c, message),
            data: data,
            meta: {
                total,
                perPage: limit,
                currentPage: page,
                lastPage: lastPage,
                from: (page - 1) * limit + 1,
                to: Math.min(page * limit, total)
            }
        }, 200)
    }

    static error(
        c: Context,
        message: string = "Internal Server Error",
        status: number = 500,
        errors: any = null
    ) {
        return c.json({
            success: false,
            statusCode: status,
            message: translate(c, message),
            errors: translateErrors(c, errors)
        }, status as ContentfulStatusCode)
    }
}
