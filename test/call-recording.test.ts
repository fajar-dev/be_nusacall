import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase } from "./setup"
import { getDataSource } from "../src/config/database"
import { TypeOrmCallRecordingRepository } from "../src/modules/call/repositories/call-recording.repository"
import { CallRecordingService, type IObjectStorage } from "../src/modules/call/call-recording.service"
import { OggOpusWriter, OPUS_FRAME_SAMPLES_20MS } from "../src/infrastructure/media/ogg-opus-writer"
import { Call } from "../src/modules/call/entities/call.entity"
import { Contact } from "../src/modules/contact/entities/contact.entity"
import { CallDirection } from "../src/modules/call/enums/call-direction.enum"
import { CallStatus } from "../src/modules/call/enums/call-status.enum"
import type { RecordedTrack } from "../src/infrastructure/media/call-recorder"

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

function collectOgg(frames: number): Buffer {
    const pages: Buffer[] = []
    const writer = new OggOpusWriter(2, (page) => pages.push(page))
    for (let i = 0; i < frames; i++) {
        writer.write(Buffer.alloc(80, i % 256), OPUS_FRAME_SAMPLES_20MS)
    }
    writer.finish()
    return Buffer.concat(pages)
}

function parsePages(data: Buffer) {
    const crcTable: number[] = []
    for (let i = 0; i < 256; i++) {
        let r = i << 24
        for (let j = 0; j < 8; j++) r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0
        crcTable.push(r >>> 0)
    }
    const crcOf = (buf: Buffer) => {
        let crc = 0
        for (const byte of buf) crc = ((crc << 8) ^ crcTable[((crc >>> 24) ^ byte) & 0xff]!) >>> 0
        return crc >>> 0
    }

    const pages: { headerType: number; granule: number; payload: Buffer; crcOk: boolean }[] = []
    let offset = 0
    while (offset < data.length) {
        expect(data.subarray(offset, offset + 4).toString("ascii")).toBe("OggS")
        const segmentCount = data.readUInt8(offset + 26)
        const table = data.subarray(offset + 27, offset + 27 + segmentCount)
        const payloadLength = table.reduce((sum, v) => sum + v, 0)
        const pageLength = 27 + segmentCount + payloadLength

        const page = Buffer.from(data.subarray(offset, offset + pageLength))
        const storedCrc = page.readUInt32LE(22)
        page.writeUInt32LE(0, 22)

        pages.push({
            headerType: data.readUInt8(offset + 5),
            granule: Number(data.readBigInt64LE(offset + 6)),
            payload: data.subarray(offset + 27 + segmentCount, offset + pageLength),
            crcOk: crcOf(page) === storedCrc,
        })
        offset += pageLength
    }
    return pages
}

describe("OggOpusWriter", () => {
    test("produces a structurally valid Ogg stream with correct CRCs", () => {
        const pages = parsePages(collectOgg(100))

        expect(pages.every(p => p.crcOk)).toBe(true)
        expect(pages[0]!.headerType & 0x02).toBe(0x02)
        expect(pages[pages.length - 1]!.headerType & 0x04).toBe(0x04)
    })

    test("starts with OpusHead then OpusTags as RFC 7845 requires", () => {
        const pages = parsePages(collectOgg(10))

        expect(pages[0]!.payload.subarray(0, 8).toString("ascii")).toBe("OpusHead")
        expect(pages[0]!.payload.readUInt8(9)).toBe(2)
        expect(pages[0]!.payload.readUInt32LE(12)).toBe(48000)
        expect(pages[1]!.payload.subarray(0, 8).toString("ascii")).toBe("OpusTags")
    })

    test("granule position tracks real duration — 500 frames of 20 ms is 10 seconds", () => {
        const pages = parsePages(collectOgg(500))
        const finalGranule = pages[pages.length - 1]!.granule

        expect(finalGranule).toBe(500 * OPUS_FRAME_SAMPLES_20MS)
        expect(finalGranule / 48000).toBe(10)
    })

    test("reports emptiness when no audio was captured", () => {
        const writer = new OggOpusWriter(2, () => {})
        expect(writer.isEmpty).toBe(true)
        writer.write(Buffer.alloc(80), OPUS_FRAME_SAMPLES_20MS)
        expect(writer.isEmpty).toBe(false)
    })
})

describe("CallRecordingService.storeRecordings", () => {
    const tracks = (): RecordedTrack[] => [
        { track: "customer", path: "/tmp/customer.opus", durationSeconds: 12.4 },
        { track: "agent", path: "/tmp/agent.opus", durationSeconds: 12.1 },
    ]

    test("uploads both tracks and records their keys", async () => {
        const call = await seedCall()
        const uploaded: string[] = []
        const service = new CallRecordingService(repository, fakeStorage({
            upload: async (objectName) => { uploaded.push(objectName); return objectName },
        }))

        await service.storeRecordings(call.id, call.wacid, tracks(), async () => Buffer.from("fake-ogg"))

        expect(uploaded).toHaveLength(2)
        const row = await repository.findByCallId(call.id)
        expect(row!.customerS3Key).toContain("-customer.opus")
        expect(row!.agentS3Key).toContain("-agent.opus")
        expect(row!.durationSeconds).toBe(12)
    })

    test("keeps the surviving track when one upload fails", async () => {
        const call = await seedCall()
        const service = new CallRecordingService(repository, fakeStorage({
            upload: async (objectName) => {
                if (objectName.includes("customer")) throw new Error("storage is down")
                return objectName
            },
        }))

        await service.storeRecordings(call.id, call.wacid, tracks(), async () => Buffer.from("fake-ogg"))

        const row = await repository.findByCallId(call.id)
        expect(row!.customerS3Key).toBeNull()
        expect(row!.agentS3Key).toContain("-agent.opus")
    })

    test("writes no row at all when every upload fails", async () => {
        const call = await seedCall()
        const service = new CallRecordingService(repository, fakeStorage({
            upload: async () => { throw new Error("storage is down") },
        }))

        await service.storeRecordings(call.id, call.wacid, tracks(), async () => Buffer.from("fake-ogg"))

        expect(await repository.findByCallId(call.id)).toBeNull()
    })
})

describe("CallRecordingService.getRecordingUrls", () => {
    test("returns a presigned URL for each stored track", async () => {
        const call = await seedCall()
        const service = new CallRecordingService(repository, fakeStorage())
        await repository.store({
            callId: call.id, wacid: call.wacid, durationSeconds: 30,
            customerS3Key: "recordings/a-customer.opus", agentS3Key: "recordings/a-agent.opus",
        })

        const urls = await service.getRecordingUrls(call.id)

        expect(urls.customer).toContain("a-customer.opus")
        expect(urls.agent).toContain("a-agent.opus")
        expect(urls.durationSeconds).toBe(30)
    })

    test("throws NotFound when the call has no recording", async () => {
        const call = await seedCall()
        const service = new CallRecordingService(repository, fakeStorage())

        await expect(service.getRecordingUrls(call.id)).rejects.toThrow()
    })
})
