import { CallRecording } from "../entities/call-recording.entity"

export interface StoreRecordingInput {
    callId: number
    wacid: string
    customerS3Key: string | null
    agentS3Key: string | null
    durationSeconds: number
    error?: string | null
}

export interface ICallRecordingRepository {
    findByCallId(callId: number): Promise<CallRecording | null>
    findByWacid(wacid: string): Promise<CallRecording | null>
    store(input: StoreRecordingInput): Promise<CallRecording>
}
