import { describe, test, expect } from "bun:test"
import { NusawaClient } from "../src/infrastructure/nusawa/nusawa.client"

interface CapturedPost {
    http: {
        post: (url: string, data: unknown, config: { params?: Record<string, string> }) => Promise<unknown>
    }
}

describe("NusawaClient.sendCallPermissionRequest", () => {
    test("sends POST request to /api/messages with correct body and query param", async () => {
        const client = new NusawaClient()
        const transport = client as unknown as CapturedPost

        let capturedUrl = ""
        let capturedData: unknown = null
        let capturedConfig: { params?: Record<string, string> } = {}

        transport.http.post = async (url, data, config) => {
            capturedUrl = url
            capturedData = data
            capturedConfig = config
            return { status: 200, data: { success: true, message_id: "msg_123" } }
        }

        const res = await client.sendCallPermissionRequest("335964456263211", "62895611024559")

        expect(capturedUrl).toBe("/api/messages")
        expect(capturedConfig.params).toEqual({ phone_number_id: "335964456263211" })
        expect(capturedData).toEqual({
            phone_number_id: "335964456263211",
            messaging_product: "whatsapp",
            to: "62895611024559",
            type: "template",
            template: {
                name: "call_permission_request",
                language: { code: "en_US" },
                components: [],
            },
        })
        expect(res).toEqual({ success: true, message_id: "msg_123" })
    })
})
