import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase } from "./setup"
import { getDataSource } from "../src/config/database"
import { TypeOrmCallRecordingRepository } from "../src/modules/call/repositories/call-recording.repository"
import { CallRecordingService, type IObjectStorage } from "../src/modules/call/call-recording.service"
import { Call } from "../src/modules/call/entities/call.entity"
import { Contact } from "../src/modules/contact/entities/contact.entity"
import { CallDirection } from "../src/modules/call/enums/call-direction.enum"
import { CallStatus } from "../src/modules/call/enums/call-status.enum"

let repository: TypeOrmCallRecordingRepository

beforeAll(async () => {
    await initTestDatabase()
    repository = new TypeOrmCallRecordingRepository()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
})

function fakeStorage(overrides: Partial<IObjectStorage> = {}): IObjectStorage {
    return {
        upload: async (objectName: string) => objectName,
        getPresignedUrl: async (objectName: string) => `https://minio.local/${objectName}?signed`,
        ...overrides,
    }
}

async function seedCall(): Promise<Call> {
    const contact = await getDataSource().getRepository(Contact).save({
        phoneNumber: `62812${Math.floor(Math.random() * 1_000_000)}`,
        name: "Rekaman",
    })
    return await getDataSource().getRepository(Call).save({
        wacid: `wacid.REC${Date.now()}${Math.floor(Math.random() * 1000)}`,
        phoneNumberId: "202063559668129",
        contactId: contact.id,
        direction: CallDirection.INBOUND,
        status: CallStatus.COMPLETED,
        statusRank: 90,
    })
}

const RECORDING_PATH = "/var/spool/asterisk/recording/nusacall-wacid.abc.wav"

describe("CallRecordingService.storeRecording", () => {
    test("mengunggah berkas rekaman Asterisk dan mencatat kuncinya", async () => {
        const call = await seedCall()
        const uploaded: { key: string; contentType: string }[] = []
        const service = new CallRecordingService(repository, fakeStorage({
            upload: async (objectName, _buffer, contentType) => {
                uploaded.push({ key: objectName, contentType })
                return objectName
            },
        }))

        await service.storeRecording(call.id, call.wacid, RECORDING_PATH, 14.6, async () => Buffer.from("fake-wav"))

        expect(uploaded).toHaveLength(1)
        expect(uploaded[0]!.contentType).toBe("audio/wav")
        expect(uploaded[0]!.key).toEndWith(".wav")

        const row = await repository.findByCallId(call.id)
        expect(row!.s3Key).toBe(uploaded[0]!.key)
        expect(row!.durationSeconds).toBe(15)
    })

    test("membaca berkas dari jalur yang diberikan Asterisk", async () => {
        const call = await seedCall()
        const readPaths: string[] = []
        const service = new CallRecordingService(repository, fakeStorage())

        await service.storeRecording(call.id, call.wacid, RECORDING_PATH, 5, async (path) => {
            readPaths.push(path)
            return Buffer.from("fake-wav")
        })

        expect(readPaths).toEqual([RECORDING_PATH])
    })

    test("tidak menyimpan apa pun ketika berkasnya tidak terbaca", async () => {
        const call = await seedCall()
        const service = new CallRecordingService(repository, fakeStorage())

        await service.storeRecording(call.id, call.wacid, RECORDING_PATH, 5, async () => {
            throw new Error("file is gone")
        })

        expect(await repository.findByCallId(call.id)).toBeNull()
    })

    test("tidak menyimpan apa pun ketika unggahan gagal", async () => {
        const call = await seedCall()
        const service = new CallRecordingService(repository, fakeStorage({
            upload: async () => { throw new Error("storage is down") },
        }))

        await service.storeRecording(call.id, call.wacid, RECORDING_PATH, 5, async () => Buffer.from("fake-wav"))

        expect(await repository.findByCallId(call.id)).toBeNull()
    })
})

describe("CallRecordingService.getRecordingUrls", () => {
    test("mengembalikan satu URL bertanda tangan", async () => {
        const call = await seedCall()
        const service = new CallRecordingService(repository, fakeStorage())
        await repository.store({ callId: call.id, durationSeconds: 30, s3Key: "recordings/a.wav" })

        const urls = await service.getRecordingUrls(call.id)

        expect(urls.url).toContain("recordings/a.wav")
        expect(urls.durationSeconds).toBe(30)
    })

    /** Rekaman era WebRTC tersimpan sebagai .opus — kuncinya harus tetap bisa diputar. */
    test("rekaman lama berformat opus tetap dapat diakses", async () => {
        const call = await seedCall()
        const service = new CallRecordingService(repository, fakeStorage())
        await repository.store({ callId: call.id, durationSeconds: 12, s3Key: "recordings/2026/08/31/lama.opus" })

        const urls = await service.getRecordingUrls(call.id)

        expect(urls.url).toContain("lama.opus")
    })

    test("melempar NotFound ketika panggilan tidak punya rekaman", async () => {
        const call = await seedCall()
        const service = new CallRecordingService(repository, fakeStorage())

        await expect(service.getRecordingUrls(call.id)).rejects.toThrow()
    })
})
