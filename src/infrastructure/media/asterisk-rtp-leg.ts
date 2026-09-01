import dgram from "node:dgram"
import { RtpPacket } from "werift"
import { logger } from "../../core/helpers/logger"
import { config } from "../../config/config"

function randomPortInRange(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1))
}

/**
 * Leg pelanggan sisi SIP: socket UDP lokal yang menerima RTP dari channel
 * externalMedia Asterisk (connection_type=client, Asterisk yang mengirim ke
 * kita) dan mengirim balik ke alamat sumber yang sama (dipelajari dari paket
 * pertama, seperti symmetric RTP).
 */
export class AsteriskRtpLeg {
    private remoteAddress: string | null = null
    private remotePort: number | null = null
    private rtpListener: ((rtp: RtpPacket) => void) | null = null
    private closed = false

    /**
     * Payload type Opus pada channel externalMedia dinegosiasikan Asterisk sendiri
     * (mis. 107) dan berbeda dari milik leg WebRTC agent/Meta (111). Mengirim balik
     * dengan payload type yang salah membuat Asterisk gagal mendecode audio kita —
     * jadi nilainya dipelajari dari paket pertama yang dikirim Asterisk.
     */
    private remotePayloadType: number | null = null

    private constructor(private readonly socket: dgram.Socket, readonly localPort: number) {
        this.socket.on("message", (msg, rinfo) => {
            if (this.closed) return
            this.remoteAddress = rinfo.address
            this.remotePort = rinfo.port
            try {
                const rtp = RtpPacket.deSerialize(msg)
                this.remotePayloadType = rtp.header.payloadType
                this.rtpListener?.(rtp)
            } catch (err) {
                logger.warn("Failed to parse RTP packet from Asterisk externalMedia", { err })
            }
        })
    }

    get payloadType(): number | null {
        return this.remotePayloadType
    }

    static bind(): Promise<AsteriskRtpLeg> {
        return new Promise((resolve, reject) => {
            const socket = dgram.createSocket("udp4")

            const tryBind = (attemptsLeft: number): void => {
                const port = randomPortInRange(config.asterisk.externalMediaPortMin, config.asterisk.externalMediaPortMax)
                const onError = (err: Error): void => {
                    if (attemptsLeft > 0) {
                        tryBind(attemptsLeft - 1)
                    } else {
                        reject(err)
                    }
                }
                socket.once("error", onError)
                socket.bind(port, config.asterisk.externalMediaHost, () => {
                    socket.removeListener("error", onError)
                    resolve(new AsteriskRtpLeg(socket, port))
                })
            }

            tryBind(20)
        })
    }

    onRtp(cb: (rtp: RtpPacket) => void): void {
        this.rtpListener = cb
    }

    sendRtp(rtp: RtpPacket): void {
        if (this.closed || !this.remoteAddress || !this.remotePort) return
        this.socket.send(rtp.serialize(), this.remotePort, this.remoteAddress, (err) => {
            if (err) logger.error("Failed sending RTP to Asterisk externalMedia", { err })
        })
    }

    close(): void {
        if (this.closed) return
        this.closed = true
        this.socket.close()
    }
}
