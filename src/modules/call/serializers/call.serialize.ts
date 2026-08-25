import { Call } from "../entities/call.entity"

export class CallSerializer {
    static single(call: Call) {
        return {
            id: call.id,
            wacid: call.wacid,
            phoneNumberId: call.phoneNumberId,
            displayPhoneNumber: call.displayPhoneNumber,
            waId: call.waId,
            profileName: call.profileName,
            contactName: call.contactName,
            agentEmail: call.agentEmail,
            direction: call.direction,
            status: call.status,
            endReason: call.endReason,
            errorCode: call.errorCode,
            errorMessage: call.errorMessage,
            ringingAt: call.ringingAt,
            answeredAt: call.answeredAt,
            endedAt: call.endedAt,
            durationSeconds: call.durationSeconds,
            setupDurationMs: call.setupDurationMs,
            recordingEnabled: call.recordingEnabled,
            transcriptionEnabled: call.transcriptionEnabled,
            createdAt: call.createdAt,
        }
    }

    static collection(calls: Call[]) {
        return calls.map((c) => this.single(c))
    }
}
