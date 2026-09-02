import { Account } from "../../account/entities/account.entity"

export interface IAsteriskCallControl {
    /** Memanggil softphone agent; begitu terangkat, Asterisk menjembatani-nya dengan leg pelanggan. */
    connectAgent(wacid: string, userId: number): Promise<void>
    /** Mengakhiri channel SIP; alasan mengikuti daftar reason ARI (busy, rejected, normal, dst). */
    hangupChannel(wacid: string, reason?: string): Promise<void>
    /** Originate channel baru ke trunk SIP Meta milik akun tsb; id channel-nya dipakai sebagai wacid. */
    originateOutbound(account: Account, calleeNumber: string): Promise<{ wacid: string }>
}
