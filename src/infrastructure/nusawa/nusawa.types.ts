export interface NusawaLogCallMessageParams {
    phoneNumberId: string
    wacid: string
    to: string
    body: string
}

export interface NusawaSendCallPermissionParams {
    phoneNumberId: string
    waId: string
    templateName: string
    templateLanguage: string
}

export interface NusawaTextMessagePayload {
    to: string
    id: string
    type: "text"
    text: { body: string }
}

export interface NusawaTemplateMessagePayload {
    phone_number_id: string
    messaging_product: "whatsapp"
    to: string
    type: "template"
    template: {
        name: string
        language: { code: string }
        components: unknown[]
    }
}

export interface NusawaApiResponse<T = unknown> {
    data?: T
    message?: string
    status?: string | number
    [key: string]: unknown
}
