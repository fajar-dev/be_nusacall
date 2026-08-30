let callCounter = 0

function nextWacid(): string {
    callCounter++
    return `wacid.TEST${Date.now()}${callCounter}`
}

interface ConnectPayloadOverrides {
    wacid?: string
    waId?: string
    phoneNumberId?: string
    businessAccountId?: string
    timestamp?: number
    direction?: "USER_INITIATED" | "BUSINESS_INITIATED"
    profileName?: string
}

export function createConnectWebhookPayload(overrides: ConnectPayloadOverrides = {}) {
    const wacid = overrides.wacid || nextWacid()
    const waId = overrides.waId || "628123456789"
    const phoneNumberId = overrides.phoneNumberId || "202063559668129"
    const businessAccountId = overrides.businessAccountId || "252757097922101"
    const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000)
    const direction = overrides.direction || "USER_INITIATED"

    return {
        object: "whatsapp_business_account",
        entry: [
            {
                id: businessAccountId,
                changes: [
                    {
                        field: "calls",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "62819854321",
                                phone_number_id: phoneNumberId,
                            },
                            contacts: [
                                {
                                    profile: { name: overrides.profileName || "Test Caller" },
                                    wa_id: waId,
                                },
                            ],
                            calls: [
                                {
                                    id: wacid,
                                    to: "62819854321",
                                    from: waId,
                                    event: "connect",
                                    timestamp: String(timestamp),
                                    direction,
                                    session: { sdp_type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n" },
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    }
}

interface StatusPayloadOverrides {
    wacid: string
    status: "RINGING" | "ACCEPTED" | "REJECTED"
    phoneNumberId?: string
    businessAccountId?: string
    recipientId?: string
    timestamp?: number
}

export function createStatusWebhookPayload(overrides: StatusPayloadOverrides) {
    const phoneNumberId = overrides.phoneNumberId || "202063559668129"
    const businessAccountId = overrides.businessAccountId || "252757097922101"
    const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000)

    return {
        object: "whatsapp_business_account",
        entry: [
            {
                id: businessAccountId,
                changes: [
                    {
                        field: "calls",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: { display_phone_number: "62819854321", phone_number_id: phoneNumberId },
                            statuses: [
                                {
                                    id: overrides.wacid,
                                    type: "call",
                                    status: overrides.status,
                                    timestamp: String(timestamp),
                                    recipient_id: overrides.recipientId || "628123456789",
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    }
}

interface TerminatePayloadOverrides {
    wacid: string
    waId?: string
    phoneNumberId?: string
    businessAccountId?: string
    status?: "COMPLETED" | "FAILED"
    startTime?: number
    endTime?: number
    duration?: number
    timestamp?: number
    errors?: Array<{ code: number; message?: string; error_data?: { details?: string } }>
}

export function createTerminateWebhookPayload(overrides: TerminatePayloadOverrides) {
    const waId = overrides.waId || "628123456789"
    const phoneNumberId = overrides.phoneNumberId || "202063559668129"
    const businessAccountId = overrides.businessAccountId || "252757097922101"
    const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000)

    const call: Record<string, unknown> = {
        id: overrides.wacid,
        to: "62819854321",
        from: waId,
        event: "terminate",
        direction: "USER_INITIATED",
        timestamp: String(timestamp),
        status: overrides.status || "COMPLETED",
    }

    if (overrides.startTime !== undefined) call.start_time = String(overrides.startTime)
    if (overrides.endTime !== undefined) call.end_time = String(overrides.endTime)
    if (overrides.duration !== undefined) call.duration = overrides.duration
    if (overrides.errors) call.errors = overrides.errors

    return {
        object: "whatsapp_business_account",
        entry: [
            {
                id: businessAccountId,
                changes: [
                    {
                        field: "calls",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: { display_phone_number: "62819854321", phone_number_id: phoneNumberId },
                            calls: [call],
                            contacts: [{ profile: { name: "Test Caller" }, wa_id: waId }],
                        },
                    },
                ],
            },
        ],
    }
}

interface AccountUpdatePayloadOverrides {
    businessAccountId?: string
    event: string
    violationType?: string
    restrictionType?: string
}

export function createAccountUpdateWebhookPayload(overrides: AccountUpdatePayloadOverrides) {
    const businessAccountId = overrides.businessAccountId || "252757097922101"
    const value: Record<string, unknown> = { event: overrides.event }
    if (overrides.violationType) value.violation_info = { violation_type: overrides.violationType }
    if (overrides.restrictionType) value.restriction_info = [{ restriction_type: overrides.restrictionType, expiration: Math.floor(Date.now() / 1000) + 86400 }]

    return {
        object: "whatsapp_business_account",
        entry: [{ id: businessAccountId, changes: [{ field: "account_update", value }] }],
    }
}

