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
import { CallStatus } from "../src/modules/call/enum/call-status.enum"

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

// Webhook processing is fire-and-forget (queueMicrotask) — 150ms headroom avoids a
// leftover query racing the shared TestDataSource teardown in another test file.
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

// The describe blocks below cover the 6 mandatory scenarios from docs/CALL-LIFECYCLE.md §2.4.

describe("Call Lifecycle - normal flow (connect -> terminate)", () => {
    test("connect creates a PENDING call; terminate marks it COMPLETED after ACCEPTED", async () => {
        const wacid = "wacid.NORMAL1"

        await postWebhook(app, createConnectWebhookPayload({ wacid }))
        await flush()

        let call = await getCall(wacid)
        expect(call).not.toBeNull()
        expect(call!.status).toBe(CallStatus.PENDING)
        expect(call!.statusRank).toBe(10)

        // Status webhook exercised purely to reach ACTIVE before terminating.
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

describe("Call Lifecycle - reversed order (terminate before connect)", () => {
    test("terminate arriving first creates the call as ABANDONED; a later connect does NOT revert it to PENDING", async () => {
        const wacid = "wacid.REVERSED1"

        // terminate arrives FIRST — Meta does not guarantee webhook ordering.
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

        // Different timestamp so this isn't deduped as an identical retry — it's a genuine
        // second terminate trying to overwrite duration.
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
        // No assertion target — just confirms no crash/side effect for the wrong field.
    })
})

// account_update is a launch-stop criteria signal (docs/ROADMAP.md), scoped per WABA.
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
        // Meta can batch multiple `changes` per entry — merge an account_update in.
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
