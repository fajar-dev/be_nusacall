export interface NusawaLoginResponse {
    access_token: string
    expires_in: number
    token_type: string
}

export interface NusawaMeResponse {
    username: string
    name: { String: string; Valid: boolean } | string | null
    branch: { String: string; Valid: boolean } | string | null
    workgroup: { String: string; Valid: boolean } | string | null
    role: string
    status: "active" | "inactive"
    permissions?: string[]
    social?: { provider: string; picture?: { String: string; Valid: boolean } | string | null }
}

type SqlNullString = { String: string; Valid: boolean } | string | null

/** GET /api/contacts — snake_case, straight off nusawa's `ContactDTO`. */
export interface NusawaContactDTO {
    phone_number: string
    name: SqlNullString
    groups: SqlNullString
    timezone: SqlNullString
    branch_code: SqlNullString
    attributes: SqlNullString
    owned_by_phone_number_id: string
    owned_by_phone_number: string
    is_group: number
    created_at: string
    updated_at: string
}

export interface NusawaContactsResponse {
    data: NusawaContactDTO[]
    meta: {
        total: number
        per_page: number
        current_page: number
        total_page: number
    }
}

/**
 * GET /api/inbox/{phone_number_id}/{phone_number} and GET /api/inbox/{id} — both return
 * this shape (docs/INTEGRATION-NUSAWA.md §3.3-3.4). Note `contact` is a hand-built map on
 * nusawa's side (plain nullable strings), NOT the same SqlNullString encoding as `username`.
 */
export interface NusawaInboxDTO {
    id: number
    username: SqlNullString
    contact?: {
        phone_number: string
        name: string | null
        branch_code: string | null
    }
    last_sent_message: SqlNullString
    tags: string[]
    resolved: number
    unread_count?: number
}

export interface NusawaInboxByContactResponse {
    data: NusawaInboxDTO[]
}

export interface NusawaInboxDetailResponse {
    data: NusawaInboxDTO
}

/** nusawa serializes SqlNullString as {"String": "...", "Valid": true|false}. */
export function unwrapNullString(v: unknown): string | null {
    if (v == null) return null
    if (typeof v === "string") return v
    if (typeof v === "object" && "Valid" in (v as object)) {
        const n = v as { String: string; Valid: boolean }
        return n.Valid ? n.String : null
    }
    return null
}
