import { CallRecording } from "../entities/call-recording.entity"

export interface StoreRecordingInput {
    callId: number
    wacid: string
    s3Key: string
    durationSeconds: number
    error?: string | null
}

export interface ICallRecordingRepository {
    findByCallId(callId: number): Promise<CallRecording | null>
    findByWacid(wacid: string): Promise<CallRecording | null>
    store(input: StoreRecordingInput): Promise<CallRecording>
}
