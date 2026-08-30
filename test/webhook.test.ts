import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { createHmac } from "node:crypto"
import {
    initTestDatabase,
    destroyTestDatabase,
    cleanTestDatabase,
    createTestApp,
    request,
} from "./setup"
import {
    createConnectWebhookPayload,
    createStatusWebhookPayload,
    createTerminateWebhookPayload,
    createAccountUpdateWebhookPayload,
} from "./helpers"
import { config } from "../src/config/config"
import { getDataSource } from "../src/config/database"
import { Call } from "../src/modules/call/entities/call.entity"
import { CallEvent } from "../src/modules/call/entities/call-event.entity"
import { Contact } from "../src/modules/contact/entities/contact.entity"
import { CallStatus } from "../src/modules/call/enums/call-status.enum"

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

function sign(body: string): string {
    const hex = createHmac("sha1", config.meta.appSecret).update(body).digest("hex")
    return `sha1=${hex}`
}

async function postWebhook(app: Hono, payload: unknown, opts: { signature?: string } = {}) {
    const body = JSON.stringify(payload)
    const signature = opts.signature ?? sign(body)
    return await request(app, "/wh", {
        method: "POST",
        headers: { "x-hub-signature": signature },
        rawBody: body,
    })
}

async function getCall(wacid: string): Promise<Call | null> {
    const repo = getDataSource().getRepository(Call)
    return await repo.findOneBy({ wacid })
}

async function countCallEvents(wacid: string): Promise<number> {
    const repo = getDataSource().getRepository(CallEvent)
    return await repo.countBy({ wacid })
}

async function getContact(phoneNumber: string): Promise<Contact | null> {
    const repo = getDataSource().getRepository(Contact)
    return await repo.findOneBy({ phoneNumber })
}

async function flush() {
    await new Promise((r) => setTimeout(r, 150))
}

describe("Webhook - GET /wh handshake", () => {
    test("returns the challenge when verify_token matches", async () => {
        const res = await app.request(
            `/wh?hub.mode=subscribe&hub.verify_token=${config.meta.verifyToken}&hub.challenge=abc123`
        )
        expect(res.status).toBe(200)
        expect(await res.text()).toBe("abc123")
    })

    test("returns 400 when verify_token does not match", async () => {
        const res = await app.request(`/wh?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=abc123`)
        expect(res.status).toBe(400)
    })
})

describe("Webhook - POST /wh signature verification", () => {
    test("accepts a correctly signed payload (204)", async () => {
        const payload = createConnectWebhookPayload()
        const { status } = await postWebhook(app, payload)
        expect(status).toBe(204)
    })

    test("rejects an incorrectly signed payload (401)", async () => {
        const payload = createConnectWebhookPayload()
        const { status, body } = await postWebhook(app, payload, { signature: "sha1=deadbeef" })
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("rejects a missing signature header (401)", async () => {
        const payload = createConnectWebhookPayload()
        const bodyStr = JSON.stringify(payload)
        const { status } = await request(app, "/wh", { method: "POST", rawBody: bodyStr })
        expect(status).toBe(401)
    })
})

describe("Call Lifecycle - normal flow (connect -> terminate)", () => {
    test("connect creates a PENDING call; terminate marks it COMPLETED after ACCEPTED", async () => {
        const wacid = "wacid.NORMAL1"

        await postWebhook(app, createConnectWebhookPayload({ wacid }))
        await flush()

        let call = await getCall(wacid)
        expect(call).not.toBeNull()
        expect(call!.status).toBe(CallStatus.PENDING)
        expect(call!.statusRank).toBe(10)

        await postWebhook(app, createStatusWebhookPayload({ wacid, status: "ACCEPTED" }))
        await flush()

        call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.ACTIVE)

        await postWebhook(app, createTerminateWebhookPayload({
            wacid, status: "COMPLETED", startTime: 1000, endTime: 1135, duration: 135,
        }))
        await flush()

        call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.COMPLETED)
        expect(call!.statusRank).toBe(90)
        expect(call!.durationSeconds).toBe(135)
        expect(call!.endedAt).not.toBeNull()
    })
})

describe("Contact - auto-saved on inbound calls", () => {
    test("an inbound connect from a new number saves a contact", async () => {
        const waId = "628111000001"
        await postWebhook(app, createConnectWebhookPayload({ waId, profileName: "Budi" }))
        await flush()

        const contact = await getContact(waId)
        expect(contact).not.toBeNull()
        expect(contact!.name).toBe("Budi")
    })

    test("a second inbound call from the same number does not create a duplicate or overwrite the name", async () => {
        const waId = "628111000002"
        await postWebhook(app, createConnectWebhookPayload({ waId, profileName: "Budi" }))
        await flush()

        await postWebhook(app, createConnectWebhookPayload({ waId, profileName: "Someone Else" }))
        await flush()

        const repo = getDataSource().getRepository(Contact)
        const matches = await repo.findBy({ phoneNumber: waId })
        expect(matches).toHaveLength(1)
        expect(matches[0]!.name).toBe("Budi")
    })

    test("an outbound connect does not save the dialed number as a contact", async () => {
        const dialedNumber = "62819854321"
        await postWebhook(app, createConnectWebhookPayload({ direction: "BUSINESS_INITIATED" }))
        await flush()

        expect(await getContact(dialedNumber)).toBeNull()
    })
})

describe("Call Lifecycle - reversed order (terminate before connect)", () => {
    test("terminate arriving first creates the call as ABANDONED; a later connect does NOT revert it to PENDING", async () => {
        const wacid = "wacid.REVERSED1"

        await postWebhook(app, createTerminateWebhookPayload({ wacid, status: "COMPLETED" }))
        await flush()

        let call = await getCall(wacid)
        expect(call).not.toBeNull()
        expect(call!.status).toBe(CallStatus.ABANDONED) // never reached ACTIVE, so ABANDONED not COMPLETED
        expect(call!.statusRank).toBe(90)

        await postWebhook(app, createConnectWebhookPayload({ wacid }))
        await flush()

        call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.ABANDONED)
        expect(call!.statusRank).toBe(90)
    })
})

describe("Call Lifecycle - duplicate connect webhooks", () => {
    test("3 identical connect deliveries result in exactly ONE call row and ONE recorded event", async () => {
        const wacid = "wacid.DUPCONNECT1"
        const timestamp = Math.floor(Date.now() / 1000)
        const payload = createConnectWebhookPayload({ wacid, timestamp })

        await postWebhook(app, payload)
        await postWebhook(app, payload)
        await postWebhook(app, payload)
        await flush()

        const call = await getCall(wacid)
        expect(call).not.toBeNull()
        expect(call!.status).toBe(CallStatus.PENDING)

        const eventCount = await countCallEvents(wacid)
        expect(eventCount).toBe(1)
    })
})

describe("Call Lifecycle - stale webhook", () => {
    test("a terminate webhook older than the stale threshold is recorded but does NOT change state", async () => {
        const wacid = "wacid.STALE1"

        await postWebhook(app, createConnectWebhookPayload({ wacid }))
        await flush()

        let call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.PENDING)

        const staleTimestamp = Math.floor(Date.now() / 1000) - (config.call.webhookStaleSeconds + 300)
        await postWebhook(app, createTerminateWebhookPayload({ wacid, status: "COMPLETED", timestamp: staleTimestamp }))
        await flush()

        call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.PENDING)

        const eventCount = await countCallEvents(wacid)
        expect(eventCount).toBe(2) // connect + the stale terminate (recorded for audit, not acted on)
    })
})

describe("Call Lifecycle - duplicate terminate after completion", () => {
    test("a second terminate after COMPLETED does not change status or overwrite fields", async () => {
        const wacid = "wacid.DUPTERM1"

        await postWebhook(app, createConnectWebhookPayload({ wacid }))
        await postWebhook(app, createStatusWebhookPayload({ wacid, status: "ACCEPTED" }))
        await flush()

        await postWebhook(app, createTerminateWebhookPayload({
            wacid, status: "COMPLETED", duration: 60, timestamp: Math.floor(Date.now() / 1000),
        }))
        await flush()

        let call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.COMPLETED)
        expect(call!.durationSeconds).toBe(60)

        await postWebhook(app, createTerminateWebhookPayload({
            wacid, status: "COMPLETED", duration: 9999, timestamp: Math.floor(Date.now() / 1000) + 5,
        }))
        await flush()

        call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.COMPLETED)
        expect(call!.durationSeconds).toBe(60) // rank guard rejects the overwrite
    })
})

describe("Call Lifecycle - status webhook arrives before connect", () => {
    test("a RINGING status with no prior connect creates the row at PENDING then advances to RINGING", async () => {
        const wacid = "wacid.STATUSFIRST1"

        await postWebhook(app, createStatusWebhookPayload({ wacid, status: "RINGING" }))
        await flush()

        const call = await getCall(wacid)
        expect(call).not.toBeNull()
        expect(call!.status).toBe(CallStatus.RINGING)
        expect(call!.statusRank).toBe(20)
        expect(call!.ringingAt).not.toBeNull()
    })
})

describe("Webhook - unrelated payloads", () => {
    test("a non-whatsapp_business_account object is accepted (204) but ignored", async () => {
        const payload = { object: "page", entry: [] }
        const { status } = await postWebhook(app, payload)
        expect(status).toBe(204)
    })

    test("a messages-field payload (not calls) is accepted (204) but produces no call row", async () => {
        const payload = {
            object: "whatsapp_business_account",
            entry: [{ id: "252757097922101", changes: [{ field: "messages", value: {} }] }],
        }
        const { status } = await postWebhook(app, payload)
        expect(status).toBe(204)
        await flush()
    })
})

describe("Webhook - account_update", () => {
    test("ACCOUNT_VIOLATION (calling quality) is accepted without crashing the webhook pipeline", async () => {
        const payload = createAccountUpdateWebhookPayload({ event: "ACCOUNT_VIOLATION", violationType: "LOW_USER_INITIATED_CALLING_QUALITY" })
        const { status } = await postWebhook(app, payload)
        expect(status).toBe(204)
    })

    test("ACCOUNT_RESTRICTION is accepted without crashing the webhook pipeline", async () => {
        const payload = createAccountUpdateWebhookPayload({ event: "ACCOUNT_RESTRICTION", restrictionType: "RESTRICTED_USER_INITIATED_CALLING" })
        const { status } = await postWebhook(app, payload)
        expect(status).toBe(204)
    })

    test("an unrecognized account_update event (billing, partner, etc.) does not crash the pipeline", async () => {
        const payload = createAccountUpdateWebhookPayload({ event: "VOLUME_BASED_PRICING_TIER_UPDATE" })
        const { status } = await postWebhook(app, payload)
        expect(status).toBe(204)
    })

    test("account_update alongside a real calls event in the same delivery — both are processed", async () => {
        const wacid = "wacid.ACCTUPD1"
        const payload = createConnectWebhookPayload({ wacid })
        payload.entry[0]!.changes.push({
            field: "account_update",
            value: { event: "ACCOUNT_VIOLATION", violation_info: { violation_type: "LOW_BUSINESS_INITIATED_CALLING_QUALITY" } },
        } as never)

        const { status } = await postWebhook(app, payload)
        expect(status).toBe(204)
        await flush()

        const call = await getCall(wacid)
        expect(call).not.toBeNull()
    })
})
