import { PhoneNumber } from "../entities/phone-number.entity"

export class PhoneNumberSerializer {
    static single(phoneNumber: PhoneNumber) {
        return {
            id: phoneNumber.id,
            phoneNumberId: phoneNumber.phoneNumberId,
            displayPhoneNumber: phoneNumber.displayPhoneNumber,
            label: phoneNumber.label,
            isTestNumber: phoneNumber.isTestNumber,
            callingEnabled: phoneNumber.callingEnabled,
            callIconVisibility: phoneNumber.callIconVisibility,
            color: phoneNumber.color,
            callHours: phoneNumber.callHours ?? null,
            answerTimeoutSeconds: phoneNumber.answerTimeoutSeconds,
            routingStrategy: phoneNumber.routingStrategy,
            lastSyncedAt: phoneNumber.lastSyncedAt ?? null,
        }
    }

    static collection(phoneNumbers: PhoneNumber[]) {
        return phoneNumbers.map((p) => this.single(p))
    }
}
