import { MediaSession } from "./media-session"
import { logger } from "../../core/helpers/logger"

class SessionRegistry {
    private readonly sessions = new Map<string, MediaSession>()

    create(wacid: string): MediaSession {
        const existing = this.sessions.get(wacid)
        if (existing) return existing

        const session = new MediaSession(wacid)
        this.sessions.set(wacid, session)
        return session
    }

    get(wacid: string): MediaSession | undefined {
        return this.sessions.get(wacid)
    }

    rekey(tempKey: string, wacid: string): void {
        const session = this.sessions.get(tempKey)
        if (!session) return
        this.sessions.delete(tempKey)
        session.wacid = wacid
        this.sessions.set(wacid, session)
    }

    async remove(wacid: string, reason: string): Promise<void> {
        const session = this.sessions.get(wacid)
        if (!session) return
        await session.close(reason)
        this.sessions.delete(wacid)
    }

    get activeCount(): number {
        return this.sessions.size
    }

    async closeAll(reason: string): Promise<void> {
        logger.info("Closing all media sessions", { count: this.sessions.size, reason })
        await Promise.all([...this.sessions.values()].map((s) => s.close(reason)))
        this.sessions.clear()
    }
}

export const sessionRegistry = new SessionRegistry()
