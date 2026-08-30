import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase } from "./setup"
import { TypeOrmNusawaLogQueueRepository } from "../src/modules/call/repositories/nusawa-log-queue.repository"
import { NusawaLogService } from "../src/modules/call/nusawa-log.service"
import { getDataSource } from "../src/config/database"
import { Call } from "../src/modules/call/entities/call.entity"
import { NusawaLogQueue } from "../src/modules/call/entities/nusawa-log-queue.entity"
import { QueueStatus } from "../src/modules/call/enums/queue-status.enum"
import { CallStatus } from "../src/modules/call/enums/call-status.enum"
import { CallDirection } from "../src/modules/call/enums/call-direction.enum"
import type { NusawaClient } from "../src/infrastructure/nusawa/nusawa.client"

let repository: TypeOrmNusawaLogQueueRepository
let callId: number

beforeAll(async () => {
    await initTestDatabase()
    repository = new TypeOrmNusawaLogQueueRepository()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
    const call = await getDataSource().getRepository(Call).save({
        wacid: "wacid.NUSAWALOGFIXTURE", phoneNumberId: "202063559668129",
        direction: CallDirection.INBOUND, status: CallStatus.COMPLETED, statusRank: 90,
    })
    callId = call.id
})

function fakeNusawaClient(logCallMessage: () => Promise<boolean>): NusawaClient {
    return { logCallMessage } as unknown as NusawaClient
}

describe("NusawaLogService.flushDue", () => {
    test("mengirim wacid dari relasi call, bukan dari kolom tersendiri", async () => {
        await repository.enqueue({ callId, phoneNumberId: "202063559668129", phoneNumber: "628123456789", body: "test" })

        let dikirim: { wacid: string; to: string } | null = null
        const client = {
            logCallMessage: async (params: { wacid: string; to: string }) => { dikirim = params; return true },
        } as unknown as NusawaClient
        await new NusawaLogService(repository, client).flushDue()

        expect(dikirim!.wacid).toBe("wacid.NUSAWALOGFIXTURE")
        expect(dikirim!.to).toBe("628123456789")
    })

    test("marks a successfully-sent row as SENT", async () => {
        const queued = await repository.enqueue({ callId, phoneNumberId: "202063559668129", phoneNumber: "628123456789", body: "test" })

        const service = new NusawaLogService(repository, fakeNusawaClient(async () => true))
        const result = await service.flushDue()

        expect(result).toEqual({ sent: 1, failed: 0 })
        const row = await getDataSource().getRepository(NusawaLogQueue).findOneBy({ id: queued.id })
        expect(row!.status).toBe(QueueStatus.SENT)
    })

    test("reschedules a failed row with the first backoff step (5s)", async () => {
        const queued = await repository.enqueue({ callId, phoneNumberId: "202063559668129", phoneNumber: "628123456789", body: "test" })

        const service = new NusawaLogService(repository, fakeNusawaClient(async () => false))
        const before = Date.now()
        const result = await service.flushDue()

        expect(result).toEqual({ sent: 0, failed: 1 })
        const row = await getDataSource().getRepository(NusawaLogQueue).findOneBy({ id: queued.id })
        expect(row!.status).toBe(QueueStatus.PENDING)
        expect(row!.attempts).toBe(1)
        expect(row!.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 4000)
        expect(row!.nextAttemptAt.getTime()).toBeLessThan(before + 10000)
    })

    test("does not retry a row whose next_attempt_at is still in the future", async () => {
        const row = await repository.enqueue({ callId, phoneNumberId: "202063559668129", phoneNumber: "628123456789", body: "test" })
        await getDataSource().getRepository(NusawaLogQueue).update(row.id, { nextAttemptAt: new Date(Date.now() + 60_000) })

        const service = new NusawaLogService(repository, fakeNusawaClient(async () => true))
        const result = await service.flushDue()

        expect(result).toEqual({ sent: 0, failed: 0 })
    })

    test("abandons a row after exhausting the backoff schedule (5 attempts)", async () => {
        const row = await repository.enqueue({ callId, phoneNumberId: "202063559668129", phoneNumber: "628123456789", body: "test" })
        await getDataSource().getRepository(NusawaLogQueue).update(row.id, { attempts: 5 })

        const service = new NusawaLogService(repository, fakeNusawaClient(async () => false))
        await service.flushDue()

        const updated = await getDataSource().getRepository(NusawaLogQueue).findOneBy({ id: row.id })
        expect(updated!.status).toBe(QueueStatus.ABANDONED)
    })
})
