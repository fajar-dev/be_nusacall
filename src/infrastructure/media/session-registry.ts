import { MediaSession } from "./media-session"
import type { RecordedTrack } from "./call-recorder"
import { logger } from "../../core/helpers/logger"

export type RecordingListener = (wacid: string, tracks: RecordedTrack[]) => Promise<void>

class SessionRegistry {
    private readonly sessions = new Map<string, MediaSession>()
    private recordingListener: RecordingListener | null = null

    attachRecordingListener(listener: RecordingListener): void {
        this.recordingListener = listener
    }

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
        await this.publishRecordings(session)
    }

    private async publishRecordings(session: MediaSession): Promise<void> {
        const tracks = session.recordings
        if (!tracks.length) return

        try {
            if (this.recordingListener) await this.recordingListener(session.wacid, tracks)
        } catch (err) {
            logger.error("Recording listener failed", { wacid: session.wacid, err })
        } finally {
            await session.discardRecordings()
        }
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
