import { upgradeWebSocket } from "hono/bun"
import { verify } from "hono/jwt"
import type { Context } from "hono"
import type { WSContext } from "hono/ws"
import { randomUUID } from "node:crypto"
import { config } from "../config/config"
import { User } from "../modules/user/entities/user.entity"
import { userRepository } from "../modules/user/user.module"
import { presenceRegistry } from "../modules/user/presence.registry"
import { logger } from "../core/helpers/logger"
import type { NusaCallJwtPayload } from "../core/helpers/auth"
import type { CallSignalingService } from "../modules/call/call-signaling.service"
import type { IAgentNotifier, WsOutboundPacket } from "../modules/call/interfaces/call-signaling.interface"

interface Connection {
    userId: number
    email: string
    ws: WSContext
}

class SignalingGateway implements IAgentNotifier {
    private service!: CallSignalingService
    private readonly connections = new Map<string, Connection>() 

    attachService(service: CallSignalingService): void {
        this.service = service
    }

    send(email: string, packet: WsOutboundPacket): void {
        for (const conn of this.connections.values()) {
            if (conn.email === email) conn.ws.send(JSON.stringify(packet))
        }
    }

    sendToAgents(emails: string[], packet: WsOutboundPacket): void {
        for (const email of emails) this.send(email, packet)
    }

    broadcast(packet: WsOutboundPacket): void {
        const raw = JSON.stringify(packet)
        for (const conn of this.connections.values()) conn.ws.send(raw)
    }

    private async authenticate(c: Context): Promise<User | null> {
        const token = c.req.query("token")
        if (!token) return null

        try {
            const decoded = (await verify(token, config.app.jwtSecret, "HS256")) as unknown as NusaCallJwtPayload
            const user = await userRepository.findById(decoded.sub)
            return user && user.isActive ? user : null
        } catch {
            return null
        }
    }

    handler() {
        return upgradeWebSocket(async (c: Context) => {
            const user = await this.authenticate(c)
            if (!user) {
                return { onOpen: (_evt: Event, ws: WSContext) => ws.close(1008, "Unauthorized") }
            }

            const connectionId = randomUUID()
            const userId = user.id
            const email = user.email

            return {
                onOpen: (_evt: Event, ws: WSContext) => {
                    logger.info("WS connected", { email, connectionId })
                    this.connections.set(connectionId, { userId, email, ws })
                    presenceRegistry.register(email, connectionId)
                    ws.send(JSON.stringify({ type: "connected", data: { email, availability: "available" }, ts: Date.now() }))
                },
                onMessage: (evt: MessageEvent) => {
                    this.dispatch(userId, email, evt.data).catch((err) => {
                        logger.error("Failed handling WS packet", { email, err })
                    })
                },
                onClose: (evt: { code: number; reason: string }) => {
                    logger.info("WS disconnected", { email, connectionId, code: evt.code, reason: evt.reason })
                    this.connections.delete(connectionId)
                    presenceRegistry.unregister(connectionId)
                },
            }
        })
    }

    private async dispatch(userId: number, email: string, raw: unknown): Promise<void> {
        let packet: { type?: string; wacid?: string; data?: Record<string, unknown> }
        try {
            packet = JSON.parse(typeof raw === "string" ? raw : String(raw))
        } catch (err) {
            logger.warn("Unparseable WS packet", { email, raw: String(raw).slice(0, 200), err })
            return
        }

        logger.info("WS packet received", { email, type: packet.type, wacid: packet.wacid })

        const wacid = packet.wacid ?? ""

        switch (packet.type) {
            case "ping":
                return
            case "answer_call":
                await this.service.handleAnswer(userId, email, wacid)
                return
            case "reject_call":
                await this.service.handleReject(email, wacid, packet.data?.reason as string | undefined)
                return
            case "hangup":
                await this.service.handleHangup(email, wacid)
                return
            default:
                logger.warn("Unknown WS packet type", { email, type: packet.type })
        }
    }
}

export const signalingGateway = new SignalingGateway()
