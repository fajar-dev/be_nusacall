import { describe, test, expect, beforeAll, afterAll, beforeEach, spyOn } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request } from "./setup"
import { AuthHelper } from "../src/core/helpers/auth"
import { NusaworkAuthSerializer } from "../src/modules/auth/serializers/nusawork-auth.serialize"

let app: Hono

beforeAll(async () => {
    await initTestDatabase()
    app = createTestApp()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
})

function panelResponse(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

describe("NusaworkAuthSerializer.status", () => {
    test("menunggu ketika QR belum dipindai", () => {
        const data = NusaworkAuthSerializer.status({ data: {} })

        expect(data.status).toBe("waiting")
        expect(data.panelToken).toBeNull()
        expect(data.profile).toBeNull()
    })

    test("meminta konfirmasi ketika profil sudah ada tetapi token belum terbit", () => {
        const data = NusaworkAuthSerializer.status({
            data: { profile: { first_name: "Budi", last_name: "Santoso", email: "budi@nusa.id", photo: null } },
        })

        expect(data.status).toBe("confirmation")
        expect(data.panelToken).toBeNull()
        expect(data.profile!.email).toBe("budi@nusa.id")
        expect(data.profile!.company).toBeNull()
    })

    test("berhasil dan membawa panelToken ketika token sudah terbit", () => {
        const data = NusaworkAuthSerializer.status({
            data: {
                token: "panel-token-123",
                profile: { first_name: "Budi", last_name: "Santoso", email: "budi@nusa.id", photo: "p.jpg", company: "Nusanet" },
            },
        })

        expect(data.status).toBe("success")
        expect(data.panelToken).toBe("panel-token-123")
        expect(data.profile!.company).toBe("Nusanet")
    })
})

describe("GET /api/auth/qrcode/:token/status", () => {
    test("tidak memerlukan autentikasi dan meneruskan status dari panel", async () => {
        spyOn(AuthHelper, "panelFetch").mockResolvedValue(panelResponse({ data: {} }))

        const { status, body } = await request(app, "/api/auth/qrcode/abc123/status")

        expect(status).toBe(200)
        expect(body.data.status).toBe("waiting")
    })
})

describe("POST /api/auth/qrcode/login", () => {
    test("400 ketika panelToken tidak disertakan", async () => {
        const { status } = await request(app, "/api/auth/qrcode/login", { method: "POST", body: {} })
        expect(status).toBe(400)
    })
})
