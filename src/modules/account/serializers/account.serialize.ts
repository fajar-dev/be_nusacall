import { Account } from "../entities/account.entity"

export class AccountSerializer {
    static single(account: Account) {
        return {
            id: account.id,
            appId: account.appId ?? null,
            phoneNumberId: account.phoneNumberId,
            displayPhoneNumber: account.displayPhoneNumber,
            label: account.label,
            callingEnabled: account.callingEnabled,
            callIconVisibility: account.callIconVisibility,
            permissionTemplateName: account.permissionTemplateName ?? null,
            permissionTemplateLanguage: account.permissionTemplateLanguage ?? null,
            color: account.color,
            callHours: account.callHours ?? null,
            lastSyncedAt: account.lastSyncedAt ?? null,
        }
    }

    static collection(accounts: Account[]) {
        return accounts.map((a) => this.single(a))
    }
}
