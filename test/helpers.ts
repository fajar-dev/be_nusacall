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

