import { Account } from "../../account/entities/account.entity"

export interface IAsteriskCallControl {
    /** Menjawab channel SIP + menyambungkannya (beserta channel externalMedia) ke bridge. */
    acceptCall(wacid: string): Promise<void>
    /** Mengakhiri channel SIP; alasan mengikuti daftar reason ARI (busy, rejected, normal, dst). */
    hangupChannel(wacid: string, reason?: string): Promise<void>
    /** Originate channel baru ke trunk SIP Meta milik akun tsb; id channel-nya dipakai sebagai wacid. */
    originateOutbound(account: Account, calleeNumber: string): Promise<{ wacid: string }>
}
