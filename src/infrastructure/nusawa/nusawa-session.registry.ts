/**
 * Caches each agent's nusawa access token from login — GET /api/contacts is
 * gated behind the agent's own JWT, not NusaCall's API key. Not persisted.
 */
interface NusawaSession {
    token: string
    expiresAt: number
}

class NusawaSessionRegistry {
    private readonly byUsername = new Map<string, NusawaSession>()

    set(username: string, token: string, expiresInSeconds: number): void {
        this.byUsername.set(username, {
            token,
            expiresAt: Date.now() + expiresInSeconds * 1000,
        })
    }

    /** Returns the cached token, or null if never set / expired. */
    get(username: string): string | null {
        const session = this.byUsername.get(username)
        if (!session) return null
        if (session.expiresAt <= Date.now()) {
            this.byUsername.delete(username)
            return null
        }
        return session.token
    }

    clear(username: string): void {
        this.byUsername.delete(username)
    }
}

export const nusawaSessionRegistry = new NusawaSessionRegistry()
