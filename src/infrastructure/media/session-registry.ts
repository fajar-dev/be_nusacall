import { MediaSession } from "./media-session"
import { logger } from "../../core/helpers/logger"

/**
 * In-memory map of active MediaSessions, keyed by wacid. Deliberately not
 * persisted — media sessions are bound to this process's WebRTC connections
 * and cannot survive a restart regardless (see docs/ARCHITECTURE.md §4.2,
 * the media plane is stateful and requires drain-before-restart).
 */
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

    /**
     * Fase 3 (outbound calls): the session is created and negotiated with
     * both legs BEFORE Meta assigns a real wacid (that only comes back in
     * the `connect` response) — re-key from the temporary placeholder once
     * it's known. No-op if the temp key was never registered (e.g. it was
     * already removed after a failure).
     */
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

    /** Used by the drain/health-check path — see docs/SETUP.md §8. */
    async closeAll(reason: string): Promise<void> {
        logger.info("Closing all media sessions", { count: this.sessions.size, reason })
        await Promise.all([...this.sessions.values()].map((s) => s.close(reason)))
        this.sessions.clear()
    }
}

export const sessionRegistry = new SessionRegistry()
