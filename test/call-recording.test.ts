import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase } from "./setup"
import { createRecordingAvailableWebhookPayload, createTranscriptionAvailableWebhookPayload } from "./helpers"
import { TypeOrmCallRepository } from "../src/modules/call/repositories/call.repository"
import { TypeOrmCallEventRepository } from "../src/modules/call/repositories/call-event.repository"
import { TypeOrmCallRecordingRepository } from "../src/modules/call/repositories/call-recording.repository"
import { CallStateService } from "../src/modules/call/call-state.service"
import { CallRecordingService, IObjectStorage } from "../src/modules/call/call-recording.service"
import { RecordingArtifactStatus } from "../src/modules/call/enum/recording-artifact-status.enum"
import { CallDirection } from "../src/modules/call/enum/call-direction.enum"
import { CallStatus } from "../src/modules/call/enum/call-status.enum"
import { WebhookService } from "../src/modules/webhook/webhook.service"
import type { ICallMediaCoordinator } from "../src/modules/call/interfaces/call-media-coordinator.interface"
import type { ICallSignalingNotifier } from "../src/modules/call/interfaces/call-signaling.interface"
import type { MetaClient } from "../src/infrastructure/meta/meta.client"

// Real DB, fake Meta Media API + object storage.

const noopMedia: ICallMediaCoordinator = {
    establishEarly: async () => ({ ok: true }), teardown: async () => {},
    applyOutboundAnswer: async () => ({ ok: true }), startOutboundForwarding: async () => {},
}
const noopSignaling: ICallSignalingNotifier = {
    notifyIncoming: async () => {}, logCallOutcome: async () => {}, notifyCallEnded: () => {}, notifyOutboundActive: () => {},
}

function fakeMetaClient(overrides: Partial<MetaClient> = {}): MetaClient {
    return {
        getMediaUrl: async (mediaId: string) => ({ url: `https://fake/${mediaId}`, mime_type: "audio/ogg; codecs=opus", sha256: "" }),
        downloadMedia: async () => Buffer.from("fake-bytes"),
        ...overrides,
    } as unknown as MetaClient
}

function fakeStorage(): { uploads: { key: string; contentType: string }[]; storage: IObjectStorage } {
    const uploads: { key: string; contentType: string }[] = []
    return {
        uploads,
        storage: {
            upload: async (objectName, _buffer, contentType) => {
                uploads.push({ key: objectName, contentType })
                return objectName
            },
            getPresignedUrl: async (objectName) => `https://fake-minio/${objectName}`,
            download: async () => Buffer.from(JSON.stringify({ transcript: { text: "fake transcript" } })),
        },
    }
}

let callRepository: TypeOrmCallRepository
let callRecordingRepository: TypeOrmCallRecordingRepository
let callStateService: CallStateService

beforeAll(async () => {
    await initTestDatabase()
    callRepository = new TypeOrmCallRepository()
    callRecordingRepository = new TypeOrmCallRecordingRepository()
    callStateService = new CallStateService(callRepository, new TypeOrmCallEventRepository())
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
})

async function seedAnsweredCall(wacid: string) {
    const call = await callStateService.findOrCreate(wacid, {
        phoneNumberId: "202063559668129", waId: "628123456789",
        direction: CallDirection.INBOUND, status: CallStatus.PENDING, statusRank: 10,
    })
    await callStateService.transition(wacid, CallStatus.CONNECTING, { agentEmail: "agent1@nusa.id" })
    await callStateService.transition(wacid, CallStatus.ACTIVE, { answeredAt: new Date() })
    await callStateService.transition(wacid, CallStatus.COMPLETED, { endedAt: new Date() })
    return call
}

describe("Webhook -> CallRecordingService — recording/transcript availability", () => {
    test("call_recording_available creates a PENDING row with a ~7-day expiry", async () => {
        const wacid = "wacid.REC1"
        await seedAnsweredCall(wacid)

        const recording = new CallRecordingService(callRecordingRepository, fakeMetaClient(), fakeStorage().storage)
        const webhook = new WebhookService(callStateService, noopMedia, noopSignaling, callRepository, recording)

        const payload = createRecordingAvailableWebhookPayload({ wacid, mediaId: "media.abc", sha256: "abc123==" })
        await webhook.process(JSON.stringify(payload))

        const row = await callRecordingRepository.findByCallId((await callRepository.findByWacid(wacid))!.id)
        expect(row).not.toBeNull()
        expect(row!.recordingStatus).toBe(RecordingArtifactStatus.PENDING)
        expect(row!.recordingMediaId).toBe("media.abc")
        expect(row!.recordingSha256).toBe("abc123==")
        const daysUntilExpiry = (row!.recordingExpiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        expect(daysUntilExpiry).toBeGreaterThan(6.9)
        expect(daysUntilExpiry).toBeLessThan(7.1)
    })

    test("call_transcription_available creates/updates the same row independently of recording", async () => {
        const wacid = "wacid.REC2"
        await seedAnsweredCall(wacid)

        const recording = new CallRecordingService(callRecordingRepository, fakeMetaClient(), fakeStorage().storage)
        const webhook = new WebhookService(callStateService, noopMedia, noopSignaling, callRepository, recording)

        await webhook.process(JSON.stringify(createRecordingAvailableWebhookPayload({ wacid })))
        await webhook.process(JSON.stringify(createTranscriptionAvailableWebhookPayload({ wacid, mediaId: "media.xyz" })))

        const row = await callRecordingRepository.findByCallId((await callRepository.findByWacid(wacid))!.id)
        expect(row!.recordingStatus).toBe(RecordingArtifactStatus.PENDING)
        expect(row!.transcriptStatus).toBe(RecordingArtifactStatus.PENDING)
        expect(row!.transcriptMediaId).toBe("media.xyz")
    })

    test("a duplicate call_recording_available webhook does not overwrite an already-processed row", async () => {
        const wacid = "wacid.REC3"
        const call = await seedAnsweredCall(wacid)

        const recording = new CallRecordingService(callRecordingRepository, fakeMetaClient(), fakeStorage().storage)
        const webhook = new WebhookService(callStateService, noopMedia, noopSignaling, callRepository, recording)

        await webhook.process(JSON.stringify(createRecordingAvailableWebhookPayload({ wacid, mediaId: "media.first" })))
        // Manually advance state past PENDING, as the download job would.
        const row = (await callRecordingRepository.findByCallId(call.id))!
        await callRecordingRepository.updateRecording(row.id, { status: RecordingArtifactStatus.STORED, s3Key: "some/key" })

        // Meta redelivers the same webhook (no exactly-once guarantee).
        await webhook.process(JSON.stringify(createRecordingAvailableWebhookPayload({ wacid, mediaId: "media.first" })))

        const after = (await callRecordingRepository.findByCallId(call.id))!
        expect(after.recordingStatus).toBe(RecordingArtifactStatus.STORED)
        expect(after.recordingS3Key).toBe("some/key")
    })
})

describe("CallRecordingService.processDueDownloads", () => {
    test("downloads, verifies SHA-256, uploads to storage, and marks STORED", async () => {
        const wacid = "wacid.REC4"
        const call = await seedAnsweredCall(wacid)
        const row = await callRecordingRepository.findOrCreate(call.id, wacid)
        const bytes = Buffer.from("real-audio-bytes")
        const { createHash } = await import("node:crypto")
        const sha256 = createHash("sha256").update(bytes).digest("hex")
        await callRecordingRepository.updateRecording(row.id, {
            status: RecordingArtifactStatus.PENDING, mediaId: "media.ok", sha256, mimeType: "audio/ogg; codecs=opus",
            availableAt: new Date(), expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        })

        const meta = fakeMetaClient({ downloadMedia: async () => bytes } as Partial<MetaClient>)
        const { uploads, storage } = fakeStorage()
        const service = new CallRecordingService(callRecordingRepository, meta, storage)

        await service.processDueDownloads()

        const after = (await callRecordingRepository.findByCallId(call.id))!
        expect(after.recordingStatus).toBe(RecordingArtifactStatus.STORED)
        expect(after.recordingS3Key).toContain(wacid)
        expect(uploads).toHaveLength(1)
    })

    test("a SHA-256 mismatch is NOT stored, stays PENDING with an error for the next tick", async () => {
        const wacid = "wacid.REC5"
        const call = await seedAnsweredCall(wacid)
        const row = await callRecordingRepository.findOrCreate(call.id, wacid)
        await callRecordingRepository.updateRecording(row.id, {
            status: RecordingArtifactStatus.PENDING, mediaId: "media.bad", sha256: "expected-does-not-match",
            mimeType: "audio/ogg; codecs=opus", availableAt: new Date(), expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        })

        const meta = fakeMetaClient({ downloadMedia: async () => Buffer.from("tampered-bytes") } as Partial<MetaClient>)
        const { uploads, storage } = fakeStorage()
        const service = new CallRecordingService(callRecordingRepository, meta, storage)

        await service.processDueDownloads()

        const after = (await callRecordingRepository.findByCallId(call.id))!
        expect(after.recordingStatus).toBe(RecordingArtifactStatus.PENDING)
        expect(after.recordingError).toContain("SHA-256 mismatch")
        expect(uploads).toHaveLength(0)
    })
})

describe("CallRecordingService.getRecordingUrl / getTranscriptContent", () => {
    test("getRecordingUrl returns a presigned URL once STORED", async () => {
        const wacid = "wacid.REC8"
        const call = await seedAnsweredCall(wacid)
        const row = await callRecordingRepository.findOrCreate(call.id, wacid)
        await callRecordingRepository.updateRecording(row.id, { status: RecordingArtifactStatus.STORED, s3Key: "recordings/2026/08/24/x.ogg" })

        const service = new CallRecordingService(callRecordingRepository, fakeMetaClient(), fakeStorage().storage)
        const url = await service.getRecordingUrl(call.id)
        expect(url).toContain("recordings/2026/08/24/x.ogg")
    })

    test("getTranscriptContent parses and returns the stored JSON", async () => {
        const wacid = "wacid.REC9"
        const call = await seedAnsweredCall(wacid)
        const row = await callRecordingRepository.findOrCreate(call.id, wacid)
        await callRecordingRepository.updateTranscript(row.id, { status: RecordingArtifactStatus.STORED, s3Key: "recordings/2026/08/24/x-transcript.json" })

        const storage: IObjectStorage = {
            upload: async () => "",
            getPresignedUrl: async () => "",
            download: async () => Buffer.from(JSON.stringify({ transcript: { text: "halo, ada yang bisa dibantu?", segments: [] } })),
        }
        const service = new CallRecordingService(callRecordingRepository, fakeMetaClient(), storage)
        const content = await service.getTranscriptContent(call.id) as { transcript: { text: string } }
        expect(content.transcript.text).toBe("halo, ada yang bisa dibantu?")
    })

    test("getTranscriptContent throws NotFound on corrupted JSON rather than returning garbage", async () => {
        const wacid = "wacid.REC10"
        const call = await seedAnsweredCall(wacid)
        const row = await callRecordingRepository.findOrCreate(call.id, wacid)
        await callRecordingRepository.updateTranscript(row.id, { status: RecordingArtifactStatus.STORED, s3Key: "recordings/2026/08/24/x-transcript.json" })

        const storage: IObjectStorage = {
            upload: async () => "", getPresignedUrl: async () => "",
            download: async () => Buffer.from("{ not valid json"),
        }
        const service = new CallRecordingService(callRecordingRepository, fakeMetaClient(), storage)
        await expect(service.getTranscriptContent(call.id)).rejects.toThrow()
    })

    test("throws Gone (410 semantics) once EXPIRED", async () => {
        const wacid = "wacid.REC11"
        const call = await seedAnsweredCall(wacid)
        const row = await callRecordingRepository.findOrCreate(call.id, wacid)
        await callRecordingRepository.updateRecording(row.id, { status: RecordingArtifactStatus.EXPIRED })

        const service = new CallRecordingService(callRecordingRepository, fakeMetaClient(), fakeStorage().storage)
        await expect(service.getRecordingUrl(call.id)).rejects.toThrow()
    })
})

describe("CallRecordingService.markExpired", () => {
    test("marks a PENDING row EXPIRED once its expiry has passed", async () => {
        const wacid = "wacid.REC6"
        const call = await seedAnsweredCall(wacid)
        const row = await callRecordingRepository.findOrCreate(call.id, wacid)
        await callRecordingRepository.updateRecording(row.id, {
            status: RecordingArtifactStatus.PENDING, mediaId: "media.toolate",
            availableAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
            expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        })

        const service = new CallRecordingService(callRecordingRepository, fakeMetaClient(), fakeStorage().storage)
        await service.markExpired()

        const after = (await callRecordingRepository.findByCallId(call.id))!
        expect(after.recordingStatus).toBe(RecordingArtifactStatus.EXPIRED)
    })

    test("does not touch a row that still has time left", async () => {
        const wacid = "wacid.REC7"
        const call = await seedAnsweredCall(wacid)
        const row = await callRecordingRepository.findOrCreate(call.id, wacid)
        await callRecordingRepository.updateRecording(row.id, {
            status: RecordingArtifactStatus.PENDING, mediaId: "media.stillgood",
            availableAt: new Date(), expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        })

        const service = new CallRecordingService(callRecordingRepository, fakeMetaClient(), fakeStorage().storage)
        await service.markExpired()

        const after = (await callRecordingRepository.findByCallId(call.id))!
        expect(after.recordingStatus).toBe(RecordingArtifactStatus.PENDING)
    })
})
