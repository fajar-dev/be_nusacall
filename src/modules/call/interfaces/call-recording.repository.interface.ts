import { CallRecording } from "../entities/call-recording.entity"

export interface StoreRecordingInput {
    callId: number
    s3Key: string
    durationSeconds: number
}

export interface ICallRecordingRepository {
    findByCallId(callId: number): Promise<CallRecording | null>
    store(input: StoreRecordingInput): Promise<CallRecording>
}
