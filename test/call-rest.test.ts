import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createAgentAndToken } from "./setup"
import { getDataSource } from "../src/config/database"
import { Call } from "../src/modules/call/entities/call.entity"
import { CallRecording } from "../src/modules/call/entities/call-recording.entity"
import { CallStatus } from "../src/modules/call/enum/call-status.enum"
import { CallDirection } from "../src/modules/call/enum/call-direction.enum"
import { EndReason } from "../src/modules/call/enum/end-reason.enum"
import { RecordingArtifactStatus } from "../src/modules/call/enum/recording-artifact-status.enum"

/** GET /api/call, /api/call/:id, /api/call/stats — docs/API-SPEC.md, Milestone 1.6. */

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

async function seedCall(overrides: Partial<Call> = {}): Promise<Call> {
    return await getDataSource().getRepository(Call).save({
        wacid: `wacid.REST${Date.now()}${Math.random()}`,
        phoneNumberId: "202063559668129",
        waId: "628123456789",
        direction: CallDirection.INBOUND,
        status: CallStatus.COMPLETED,
        statusRank: 90,
        durationSeconds: 120,
        ...overrides,
    })
}

describe("GET /api/call", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/call")
        expect(status).toBe(401)
    })

    test("lists calls, paginated", async () => {
        const { headers } = await createAgentAndToken()
        await seedCall()
        await seedCall()

        const { status, body } = await request(app, "/api/call?page=1&limit=10", { headers })

        expect(status).toBe(200)
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(2)
        expect(body.meta.total).toBe(2)
    })

    test("filters by status", async () => {
        const { headers } = await createAgentAndToken()
        await seedCall({ status: CallStatus.COMPLETED, statusRank: 90 })
        await seedCall({ status: CallStatus.MISSED, statusRank: 90 })

        const { body } = await request(app, "/api/call?status=missed", { headers })

        expect(body.data).toHaveLength(1)
        expect(body.data[0].status).toBe("missed")
    })

    test("searches by waId/contactName/wacid", async () => {
        const { headers } = await createAgentAndToken()
        await seedCall({ waId: "628111111111" })
        await seedCall({ waId: "628222222222" })

        const { body } = await request(app, "/api/call?q=628111111111", { headers })

        expect(body.data).toHaveLength(1)
        expect(body.data[0].waId).toBe("628111111111")
    })
})

describe("GET /api/call/:id", () => {
    test("returns a single call", async () => {
        const { headers } = await createAgentAndToken()
        const call = await seedCall()

        const { status, body } = await request(app, `/api/call/${call.id}`, { headers })

        expect(status).toBe(200)
        expect(body.data.wacid).toBe(call.wacid)
    })

    test("404s for a non-existent call", async () => {
        const { headers } = await createAgentAndToken()
        const { status } = await request(app, "/api/call/999999", { headers })
        expect(status).toBe(404)
    })
})

describe("GET /api/call/stats", () => {
    test("aggregates totals by outcome", async () => {
        const { headers } = await createAgentAndToken()
        await seedCall({ status: CallStatus.COMPLETED, statusRank: 90, durationSeconds: 100 })
        await seedCall({ status: CallStatus.COMPLETED, statusRank: 90, durationSeconds: 200 })
        await seedCall({ status: CallStatus.MISSED, statusRank: 90, durationSeconds: null, endReason: EndReason.NO_AGENT_AVAILABLE })

        const { status, body } = await request(app, "/api/call/stats", { headers })

        expect(status).toBe(200)
        expect(body.data.total).toBe(3)
        expect(body.data.answered).toBe(2)
        expect(body.data.missed).toBe(1)
        expect(body.data.avgDurationSeconds).toBe(150)
    })
})

describe("GET /api/call/:id/recording", () => {
    test("requires authentication", async () => {
        const { status } = await request(app, "/api/call/1/recording")
        expect(status).toBe(401)
    })

    test("404s when the call has no recording row at all", async () => {
        const { headers } = await createAgentAndToken()
        const call = await seedCall()
        const { status } = await request(app, `/api/call/${call.id}/recording`, { headers })
        expect(status).toBe(404)
    })

    test("404s while still pending (not downloaded yet)", async () => {
        const { headers } = await createAgentAndToken()
        const call = await seedCall()
        await getDataSource().getRepository(CallRecording).save({
            callId: call.id, wacid: call.wacid, recordingStatus: RecordingArtifactStatus.PENDING,
        })
        const { status } = await request(app, `/api/call/${call.id}/recording`, { headers })
        expect(status).toBe(404)
    })

    test("410s when Meta's 7-day window passed before we downloaded it", async () => {
        const { headers } = await createAgentAndToken()
        const call = await seedCall()
        await getDataSource().getRepository(CallRecording).save({
            callId: call.id, wacid: call.wacid, recordingStatus: RecordingArtifactStatus.EXPIRED,
        })
        const { status } = await request(app, `/api/call/${call.id}/recording`, { headers })
        expect(status).toBe(410)
    })

    test("returns a presigned URL once stored", async () => {
        const { headers } = await createAgentAndToken()
        const call = await seedCall()
        await getDataSource().getRepository(CallRecording).save({
            callId: call.id, wacid: call.wacid,
            recordingStatus: RecordingArtifactStatus.STORED, recordingS3Key: `recordings/2026/08/24/${call.wacid}-recording.ogg`,
        })
        const { status, body } = await request(app, `/api/call/${call.id}/recording`, { headers })
        expect(status).toBe(200)
        expect(typeof body.data.url).toBe("string")
        expect(body.data.url.length).toBeGreaterThan(0)
    })
})
