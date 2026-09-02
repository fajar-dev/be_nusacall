import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { createHmac } from "node:crypto"
import {
    initTestDatabase,
    destroyTestDatabase,
    cleanTestDatabase,
    createTestApp,
    request, TEST_APP_SECRET, TEST_VERIFY_TOKEN } from "./setup"
import {
    createStatusWebhookPayload,
    createAccountUpdateWebhookPayload,
} from "./helpers"
import { config } from "../src/config/config"
import { getDataSource } from "../src/config/database"
import { Call } from "../src/modules/call/entities/call.entity"
import { CallEvent } from "../src/modules/call/entities/call-event.entity"
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
    const hex = createHmac("sha1", TEST_APP_SECRET).update(body).digest("hex")
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

async function flush() {
    await new Promise((r) => setTimeout(r, 150))
}

describe("Webhook - GET /wh handshake", () => {
    test("returns the challenge when verify_token matches", async () => {
        const res = await app.request(
            `/wh?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=abc123`
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
        const payload = createStatusWebhookPayload({ wacid: "wacid.SIGVERIFY1", status: "RINGING" })
        const { status } = await postWebhook(app, payload)
        expect(status).toBe(204)
    })

    test("rejects an incorrectly signed payload (401)", async () => {
        const payload = createStatusWebhookPayload({ wacid: "wacid.SIGVERIFY2", status: "RINGING" })
        const { status, body } = await postWebhook(app, payload, { signature: "sha1=deadbeef" })
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })

    test("rejects a missing signature header (401)", async () => {
        const payload = createStatusWebhookPayload({ wacid: "wacid.SIGVERIFY3", status: "RINGING" })
        const bodyStr = JSON.stringify(payload)
        const { status } = await request(app, "/wh", { method: "POST", rawBody: bodyStr })
        expect(status).toBe(401)
    })
})

describe("Call Lifecycle - status webhook arrives before any ARI-driven call row exists", () => {
    test("a RINGING status with no prior call creates the row at PENDING then advances to RINGING", async () => {
        const wacid = "wacid.STATUSFIRST1"

        await postWebhook(app, createStatusWebhookPayload({ wacid, status: "RINGING" }))
        await flush()

        const call = await getCall(wacid)
        expect(call).not.toBeNull()
        expect(call!.status).toBe(CallStatus.RINGING)
        expect(call!.statusRank).toBe(20)
        expect(call!.ringingAt).not.toBeNull()
    })

    test("ACCEPTED marks the call ACTIVE and stamps recordingEnabled", async () => {
        const wacid = "wacid.STATUSACCEPTED1"

        await postWebhook(app, createStatusWebhookPayload({ wacid, status: "RINGING" }))
        await flush()
        await postWebhook(app, createStatusWebhookPayload({ wacid, status: "ACCEPTED" }))
        await flush()

        const call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.ACTIVE)
        expect(call!.recordingEnabled).toBe(config.recording.recordingEnabled)
    })
})

describe("Call Lifecycle - duplicate status webhooks", () => {
    test("3 identical RINGING deliveries result in exactly ONE recorded event", async () => {
        const wacid = "wacid.DUPSTATUS1"
        const timestamp = Math.floor(Date.now() / 1000)
        const payload = createStatusWebhookPayload({ wacid, status: "RINGING", timestamp })

        await postWebhook(app, payload)
        await postWebhook(app, payload)
        await postWebhook(app, payload)
        await flush()

        const call = await getCall(wacid)
        expect(call).not.toBeNull()
        expect(call!.status).toBe(CallStatus.RINGING)

        const eventCount = await countCallEvents(wacid)
        expect(eventCount).toBe(1)
    })
})

describe("Call Lifecycle - stale webhook", () => {
    test("a status webhook older than the stale threshold is recorded but does NOT change state", async () => {
        const wacid = "wacid.STALE1"

        await postWebhook(app, createStatusWebhookPayload({ wacid, status: "RINGING" }))
        await flush()

        let call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.RINGING)

        const staleTimestamp = Math.floor(Date.now() / 1000) - (config.call.webhookStaleSeconds + 300)
        await postWebhook(app, createStatusWebhookPayload({ wacid, status: "ACCEPTED", timestamp: staleTimestamp }))
        await flush()

        call = await getCall(wacid)
        expect(call!.status).toBe(CallStatus.RINGING)

        const eventCount = await countCallEvents(wacid)
        expect(eventCount).toBe(2)
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

    test("account_update alongside a real status event in the same delivery — both are processed", async () => {
        const wacid = "wacid.ACCTUPD1"
        const payload = createStatusWebhookPayload({ wacid, status: "RINGING" }) as Record<string, any>
        payload.entry[0].changes.push({
            field: "account_update",
            value: { event: "ACCOUNT_VIOLATION", violation_info: { violation_type: "LOW_BUSINESS_INITIATED_CALLING_QUALITY" } },
        })

        const { status } = await postWebhook(app, payload)
        expect(status).toBe(204)
        await flush()

        const call = await getCall(wacid)
        expect(call).not.toBeNull()
    })
})
