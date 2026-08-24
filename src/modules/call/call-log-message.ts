/** Message formats straight from docs/INTEGRATION-NUSAWA.md §3.5's outcome table. */
export type CallLogOutcome = "completed" | "rejected" | "missed"

export function formatCallLogMessage(outcome: CallLogOutcome, opts: { durationSeconds?: number | null; agentUsername?: string | null }): string {
    switch (outcome) {
        case "completed":
            return `📞 Panggilan masuk · ${formatDuration(opts.durationSeconds ?? 0)} · dijawab ${opts.agentUsername ?? "agent"}`
        case "rejected":
            return "📞 Panggilan masuk ditolak"
        case "missed": {
            const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())
            return `📞 Panggilan masuk tidak terjawab · ${time}`
        }
    }
}

function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}m ${seconds}d`
}
