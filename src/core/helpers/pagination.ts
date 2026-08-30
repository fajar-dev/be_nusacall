import { Context } from "hono"

export interface PaginationQuery {
    page: number
    limit: number
}

export function parsePagination(c: Context, defaultLimit = 10): PaginationQuery {
    return {
        page: Number(c.req.query("page") || 1),
        limit: Number(c.req.query("limit") || defaultLimit),
    }
}
