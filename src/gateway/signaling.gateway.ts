import { upgradeWebSocket } from "hono/bun"
import { verify } from "hono/jwt"
import type { Context } from "hono"
import type { WSContext } from "hono/ws"
import { randomUUID } from "node:crypto"
import { config } from "../config/config"
import { AppDataSource } from "../config/database"
import { Agent } from "../modules/agent/entities/agent.entity"
import { presenceRegistry } from "../modules/agent/presence.registry"
import { logger } from "../core/helpers/logger"
import type { NusaCallJwtPayload } from "../core/helpers/auth"
import type { CallSignalingService } from "../modules/call/call-signaling.service"
import type { IAgentNotifier, WsOutboundPacket } from "../modules/call/interfaces/call-signaling.interface"

interface Connection {
    username: string
    ws: WSContext
}

/**
 * WebSocket transport for the softphone (docs/API-SPEC.md §8). Pure
 * transport — parses/dispatches packets and calls CallSignalingService for
 * everything else, never touching the database directly (docs/ARCHITECTURE.md).
 * Token arrives via `?token=` query string since the browser WebSocket API
 * has no custom-header support (same pattern nusawa uses).
 */
export class SignalingGateway implements IAgentNotifier {
    private service!: CallSignalingService
    private readonly connections = new Map<string, Connection>() // connectionId -> conn

    /** Broken out from the constructor to avoid a circular dependency with CallSignalingService. */
    attachService(service: CallSignalingService): void {
        this.service = service
    }

    send(username: string, packet: WsOutboundPacket): void {
        for (const conn of this.connections.values()) {
            if (conn.username === username) conn.ws.send(JSON.stringify(packet))
        }
    }

    sendToAgents(usernames: string[], packet: WsOutboundPacket): void {
        for (const username of usernames) this.send(username, packet)
    }

    private async authenticate(c: Context): Promise<Agent | null> {
        const token = c.req.query("token")
        if (!token) return null

        try {
            const decoded = (await verify(token, config.app.jwtSecret, "HS256")) as unknown as NusaCallJwtPayload
            return await AppDataSource.getRepository(Agent).findOne({ where: { username: decoded.sub } })
        } catch {
            return null
        }
    }

    handler() {
        return upgradeWebSocket(async (c: Context) => {
            const agent = await this.authenticate(c)
            if (!agent) {
                return { onOpen: (_evt: Event, ws: WSContext) => ws.close(1008, "Unauthorized") }
            }

            const connectionId = randomUUID()
            const username = agent.username

            return {
                onOpen: (_evt: Event, ws: WSContext) => {
                    logger.info("WS connected", { username, connectionId })
                    this.connections.set(connectionId, { username, ws })
                    presenceRegistry.register(username, connectionId)
                    ws.send(JSON.stringify({ type: "connected", data: { username, availability: "available" }, ts: Date.now() }))
                },
                onMessage: (evt: MessageEvent) => {
                    this.dispatch(username, evt.data).catch((err) => {
                        logger.error("Failed handling WS packet", { username, err })
                    })
                },
                onClose: (evt: { code: number; reason: string }) => {
                    logger.info("WS disconnected", { username, connectionId, code: evt.code, reason: evt.reason })
                    this.connections.delete(connectionId)
                    presenceRegistry.unregister(connectionId)
                },
            }
        })
    }

    private async dispatch(username: string, raw: unknown): Promise<void> {
        let packet: { type?: string; wacid?: string; data?: Record<string, unknown> }
        try {
            packet = JSON.parse(typeof raw === "string" ? raw : String(raw))
        } catch (err) {
            logger.warn("Unparseable WS packet", { username, raw: String(raw).slice(0, 200), err })
            return
        }

        logger.info("WS packet received", { username, type: packet.type, wacid: packet.wacid })

        const wacid = packet.wacid ?? ""

        switch (packet.type) {
            case "ping":
                return
            case "set_availability":
                presenceRegistry.setAvailability(username, packet.data?.availability as never)
                return
            case "answer_call":
                await this.service.handleAnswer(username, wacid, packet.data?.sdp as string)
                return
            case "reject_call":
                await this.service.handleReject(username, wacid, packet.data?.reason as string | undefined)
                return
            case "hangup":
                await this.service.handleHangup(username, wacid)
                return
            default:
                logger.warn("Unknown WS packet type", { username, type: packet.type })
        }
    }
}

export const signalingGateway = new SignalingGateway()
