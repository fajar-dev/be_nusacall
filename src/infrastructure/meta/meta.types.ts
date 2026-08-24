export interface MetaSession {
    sdp_type: "offer" | "answer"
    sdp: string
}

export interface MetaCallActionRequest {
    messaging_product: "whatsapp"
    call_id?: string
    to?: string
    recipient?: string
    action: "connect" | "pre_accept" | "accept" | "reject" | "terminate"
    session?: MetaSession
    biz_opaque_callback_data?: string
    recording?: { status: "ENABLED" | "DISABLED"; purpose?: string; announcement_language?: string }
    transcription?: { status: "ENABLED" | "DISABLED"; purpose?: string; announcement_language?: string }
}

export interface MetaCallActionResponse {
    messaging_product?: "whatsapp"
    success?: boolean
    calls?: Array<{ id: string }>
}

export interface MetaErrorResponse {
    error: {
        message: string
        type: string
        code: number
        error_subcode?: number
        fbtrace_id?: string
    }
}

/** docs/INTEGRATION-META.md §5.2 — bersifat REPLACE, bukan merge, saat ditulis kembali. */
export interface MetaCallSettings {
    calling: {
        status: "ENABLED" | "DISABLED"
        call_icon_visibility: "DEFAULT" | "DISABLE_ALL"
        call_hours?: {
            status: "ENABLED" | "DISABLED"
            timezone_id: string
            weekly_operating_hours: Array<{ day_of_week: string; open_time: string; close_time: string }>
            holiday_schedule?: Array<{ date: string; start_time: string; end_time: string }>
        }
    }
}

export interface MetaHealthStatusResponse {
    id: string
    health_status?: {
        can_send_message?: string
        entities?: Array<{ entity_type: string; id: string; can_send_message: string; errors?: Array<{ error_code: number; error_description: string }> }>
    }
}

/** Fase 3 — POST /{phone-number-id}/messages, a call permission request template. */
export interface MetaSendTemplateRequest {
    messaging_product: "whatsapp"
    recipient_type: "individual"
    to: string
    type: "template"
    template: {
        name: string
        language: { code: string }
    }
}

export interface MetaSendMessageResponse {
    messaging_product: "whatsapp"
    contacts: Array<{ input: string; wa_id: string }>
    messages: Array<{ id: string }>
}

export interface MetaCallPermissionResponse {
    messaging_product: "whatsapp"
    permission: {
        status: "no_permission" | "temporary" | "permanent"
        expiration_time?: number
    }
    actions: Array<{
        action_name: "send_call_permission_request" | "start_call"
        can_perform_action: boolean
        limits: Array<{ time_period: string; max_allowed: number; current_usage: number; limit_expiration_time?: number }>
    }>
}
