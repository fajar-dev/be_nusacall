export type UserAvailability = "available" | "offline"

export interface UserPresence {
    email: string
    availability: UserAvailability
    currentCallId: number | null
    connectionIds: Set<string>
    connectedAt: Date
}

/**
 * In-memory registry of online users — not persisted (WebSocket connections die with the process).
 * "Available" lasts the whole connection lifetime; "busy" is expressed by `currentCallId !== null`, not a separate state.
 */
class PresenceRegistry {
    private readonly byEmail = new Map<string, UserPresence>()
    private readonly byConnection = new Map<string, string>() // connectionId -> email

    register(email: string, connectionId: string): UserPresence {
        let presence = this.byEmail.get(email)
        if (!presence) {
            presence = {
                email,
                availability: "available",
                currentCallId: null,
                connectionIds: new Set(),
                connectedAt: new Date(),
            }
            this.byEmail.set(email, presence)
        }
        presence.connectionIds.add(connectionId)
        this.byConnection.set(connectionId, email)
        return presence
    }

    /** Returns true if the user has no more live connections (fully offline). */
    unregister(connectionId: string): boolean {
        const email = this.byConnection.get(connectionId)
        if (!email) return false

        this.byConnection.delete(connectionId)
        const presence = this.byEmail.get(email)
        if (!presence) return true

        presence.connectionIds.delete(connectionId)
        if (presence.connectionIds.size === 0) {
            this.byEmail.delete(email)
            return true
        }
        return false
    }

    setCurrentCall(email: string, callId: number | null): void {
        const presence = this.byEmail.get(email)
        if (presence) presence.currentCallId = callId
    }

    get(email: string): UserPresence | undefined {
        return this.byEmail.get(email)
    }

    isAvailable(email: string): boolean {
        const presence = this.byEmail.get(email)
        return presence?.availability === "available" && presence.currentCallId === null
    }

    listAvailable(): UserPresence[] {
        return [...this.byEmail.values()].filter(
            (p) => p.availability === "available" && p.currentCallId === null
        )
    }

    listAll(): UserPresence[] {
        return [...this.byEmail.values()]
    }
}

export const presenceRegistry = new PresenceRegistry()
