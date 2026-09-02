import { Call } from "../entities/call.entity"
import { UserSerializer } from "../../user/serializers/user.serialize"
import { ContactSerializer } from "../../contact/serializers/contact.serialize"

export class CallSerializer {
    static async single(call: Call) {
        return {
            id: call.id,
            wacid: call.wacid,
            phoneNumberId: call.phoneNumberId,
            account: call.account
                ? {
                    phoneNumberId: call.account.phoneNumberId,
                    label: call.account.label,
                    displayPhoneNumber: call.account.displayPhoneNumber,
                    isOfficial: call.account.isOfficial,
                }
                : null,
            contact: call.contact ? ContactSerializer.single(call.contact) : null,
            user: call.user ? await UserSerializer.summary(call.user) : null,
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
            createdAt: call.createdAt,
        }
    }

    static async collection(calls: Call[]) {
        return Promise.all(calls.map((c) => this.single(c)))
    }
}
