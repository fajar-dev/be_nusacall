export enum CallStatus {
    PENDING = "pending",
    RINGING = "ringing",
    CONNECTING = "connecting",
    ACTIVE = "active",
    COMPLETED = "completed",
    MISSED = "missed",
    REJECTED = "rejected",
    FAILED = "failed",
    ABANDONED = "abandoned",
}

/**
 * Monotonic rank per state. A transition to a LOWER rank must be rejected —
 * this is the guard against Meta's out-of-order webhook delivery.
 * See: docs/CALL-LIFECYCLE.md §2
 */
export const CALL_STATUS_RANK: Record<CallStatus, number> = {
    [CallStatus.PENDING]: 10,
    [CallStatus.RINGING]: 20,
    [CallStatus.CONNECTING]: 30,
    [CallStatus.ACTIVE]: 40,
    [CallStatus.COMPLETED]: 90,
    [CallStatus.MISSED]: 90,
    [CallStatus.REJECTED]: 90,
    [CallStatus.FAILED]: 90,
    [CallStatus.ABANDONED]: 90,
}

export const TERMINAL_CALL_STATUSES: readonly CallStatus[] = [
    CallStatus.COMPLETED,
    CallStatus.MISSED,
    CallStatus.REJECTED,
    CallStatus.FAILED,
    CallStatus.ABANDONED,
]

export function isTerminalCallStatus(status: CallStatus): boolean {
    return TERMINAL_CALL_STATUSES.includes(status)
}
