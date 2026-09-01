import axios, { AxiosResponse } from "axios"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"
import { BadGatewayException } from "../../core/exceptions/base"

export interface AriChannel {
    id: string
    state: string
    caller: { number: string; name: string }
}

export interface AriStasisStartEvent {
    type: "StasisStart"
    application: string
    args: string[]
    channel: AriChannel
}

export interface AriStasisEndEvent {
    type: "StasisEnd"
    application: string
    channel: AriChannel
}

export interface AriChannelStateChangeEvent {
    type: "ChannelStateChange"
    channel: AriChannel
}

type AriEvent = { type: string; [key: string]: unknown }

type StasisStartListener = (event: AriStasisStartEvent) => void
type StasisEndListener = (event: AriStasisEndEvent) => void
type ChannelStateChangeListener = (event: AriChannelStateChangeEvent) => void

export class AriClient {
    private ws: WebSocket | null = null
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private readonly stasisStartListeners: StasisStartListener[] = []
    private readonly stasisEndListeners: StasisEndListener[] = []
    private readonly stateChangeListeners: ChannelStateChangeListener[] = []

    private async request<T>(method: "get" | "post" | "delete", path: string, params?: Record<string, string | undefined>): Promise<T> {
        const url = `${config.asterisk.ariBaseUrl}/ari${path}`
        let res: AxiosResponse
        try {
            res = await axios.request({
                method,
                url,
                params,
                auth: { username: config.asterisk.ariUsername, password: config.asterisk.ariPassword },
                validateStatus: () => true,
            })
        } catch (err) {
            logger.error("ARI request failed (network)", { url, err })
            throw new BadGatewayException("Failed to reach Asterisk ARI")
        }
        if (res.status < 200 || res.status >= 300) {
            logger.error("ARI request returned an error", { url, status: res.status, body: res.data })
            throw new BadGatewayException(`Asterisk ARI error (HTTP ${res.status})`, { body: res.data })
        }
        return res.data as T
    }

    /** Menyambungkan event stream ARI (StasisStart/StasisEnd/dll); reconnect otomatis kalau putus. */
    connect(): void {
        const base = config.asterisk.ariBaseUrl.replace(/^http/, "ws")
        const wsUrl = `${base}/ari/events?app=${config.asterisk.ariApp}&subscribeAll=true`
        const basicAuth = Buffer.from(`${config.asterisk.ariUsername}:${config.asterisk.ariPassword}`).toString("base64")

        // Server ini menolak auth lewat query string api_key (401) — perlu header Authorization eksplisit.
        this.ws = new WebSocket(wsUrl, { headers: { Authorization: `Basic ${basicAuth}` } })

        this.ws.addEventListener("open", () => {
            logger.info("Connected to Asterisk ARI event stream", { app: config.asterisk.ariApp })
        })

        this.ws.addEventListener("message", (ev) => {
            const raw = typeof ev.data === "string" ? ev.data : ev.data.toString()
            let event: AriEvent
            try {
                event = JSON.parse(raw)
            } catch (err) {
                logger.warn("Failed to parse ARI event", { err })
                return
            }
            this.dispatch(event)
        })

        this.ws.addEventListener("close", () => {
            logger.warn("Asterisk ARI event stream closed — reconnecting in 5s")
            this.scheduleReconnect()
        })

        this.ws.addEventListener("error", (ev) => {
            const message = "message" in ev && typeof ev.message === "string" ? ev.message : String(ev)
            logger.error("Asterisk ARI event stream error", { message })
        })
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this.connect()
        }, 5000)
    }

    private dispatch(event: AriEvent): void {
        if (event.type === "StasisStart") {
            for (const listener of this.stasisStartListeners) listener(event as unknown as AriStasisStartEvent)
        } else if (event.type === "StasisEnd") {
            for (const listener of this.stasisEndListeners) listener(event as unknown as AriStasisEndEvent)
        } else if (event.type === "ChannelStateChange") {
            for (const listener of this.stateChangeListeners) listener(event as unknown as AriChannelStateChangeEvent)
        }
    }

    onStasisStart(listener: StasisStartListener): void {
        this.stasisStartListeners.push(listener)
    }

    onStasisEnd(listener: StasisEndListener): void {
        this.stasisEndListeners.push(listener)
    }

    onChannelStateChange(listener: ChannelStateChangeListener): void {
        this.stateChangeListeners.push(listener)
    }

    async originateChannel(params: { endpoint: string; app: string; appArgs?: string; callerId?: string; timeoutSeconds?: number }): Promise<AriChannel> {
        return this.request("post", "/channels", {
            endpoint: params.endpoint,
            app: params.app,
            appArgs: params.appArgs,
            callerId: params.callerId,
            timeout: params.timeoutSeconds ? String(params.timeoutSeconds) : undefined,
        })
    }

    async ringChannel(channelId: string): Promise<void> {
        await this.request("post", `/channels/${channelId}/ring`)
    }

    async answerChannel(channelId: string): Promise<void> {
        await this.request("post", `/channels/${channelId}/answer`)
    }

    async hangupChannel(channelId: string, reason?: string): Promise<void> {
        await this.request("delete", `/channels/${channelId}`, { reason })
    }

    async createBridge(): Promise<{ id: string }> {
        return this.request("post", "/bridges", { type: "mixing" })
    }

    async addChannelToBridge(bridgeId: string, channelId: string): Promise<void> {
        await this.request("post", `/bridges/${bridgeId}/addChannel`, { channel: channelId })
    }

    async destroyBridge(bridgeId: string): Promise<void> {
        await this.request("delete", `/bridges/${bridgeId}`)
    }

    async createExternalMedia(params: { app: string; externalHost: string; format?: string }): Promise<AriChannel> {
        return this.request("post", "/channels/externalMedia", {
            app: params.app,
            external_host: params.externalHost,
            format: params.format ?? "opus",
            encapsulation: "rtp",
            transport: "udp",
            connection_type: "client",
            direction: "both",
        })
    }
}

export const ariClient = new AriClient()
