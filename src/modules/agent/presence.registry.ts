export type AgentAvailability = "available" | "busy" | "away" | "offline"

export interface AgentPresence {
    username: string
    availability: AgentAvailability
    currentCallId: number | null
    connectionIds: Set<string>
    connectedAt: Date
}

/**
 * In-memory registry of which agents are online and what they're doing.
 * Not persisted — WebSocket connections die with the process anyway, so
 * stale presence would be worse than none. See docs/BACKEND-MODULES.md §3.
 */
class PresenceRegistry {
    private readonly byUsername = new Map<string, AgentPresence>()
    private readonly byConnection = new Map<string, string>() // connectionId -> username

    register(username: string, connectionId: string): AgentPresence {
        let presence = this.byUsername.get(username)
        if (!presence) {
            presence = {
                username,
                availability: "available",
                currentCallId: null,
                connectionIds: new Set(),
                connectedAt: new Date(),
            }
            this.byUsername.set(username, presence)
        }
        presence.connectionIds.add(connectionId)
        this.byConnection.set(connectionId, username)
        return presence
    }

    /** Returns true if the agent has no more live connections (fully offline). */
    unregister(connectionId: string): boolean {
        const username = this.byConnection.get(connectionId)
        if (!username) return false

        this.byConnection.delete(connectionId)
        const presence = this.byUsername.get(username)
        if (!presence) return true

        presence.connectionIds.delete(connectionId)
        if (presence.connectionIds.size === 0) {
            this.byUsername.delete(username)
            return true
        }
        return false
    }

    setAvailability(username: string, availability: AgentAvailability): void {
        const presence = this.byUsername.get(username)
        if (presence) presence.availability = availability
    }

    setCurrentCall(username: string, callId: number | null): void {
        const presence = this.byUsername.get(username)
        if (presence) presence.currentCallId = callId
    }

    get(username: string): AgentPresence | undefined {
        return this.byUsername.get(username)
    }

    isAvailable(username: string): boolean {
        const presence = this.byUsername.get(username)
        return presence?.availability === "available" && presence.currentCallId === null
    }

    listAvailable(): AgentPresence[] {
        return [...this.byUsername.values()].filter(
            (p) => p.availability === "available" && p.currentCallId === null
        )
    }

    listAll(): AgentPresence[] {
        return [...this.byUsername.values()]
    }
}

export const presenceRegistry = new PresenceRegistry()
