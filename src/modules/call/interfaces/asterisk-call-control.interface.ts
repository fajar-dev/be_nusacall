import { Account } from "../../account/entities/account.entity"

export interface IAsteriskCallControl {
    connectAgent(wacid: string, userId: number): Promise<void>

    hangupChannel(wacid: string, reason?: string): Promise<void>

    originateOutbound(account: Account, calleeNumber: string): Promise<{ wacid: string }>
}
