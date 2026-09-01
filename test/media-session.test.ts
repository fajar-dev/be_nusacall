import { describe, test, expect } from "bun:test"
import dgram from "node:dgram"
import type { AddressInfo } from "node:net"
import { RTCPeerConnection, RTCRtpCodecParameters, RtpPacket, RtpHeader } from "werift"
import { MediaSession } from "../src/infrastructure/media/media-session"
import { AsteriskRtpLeg } from "../src/infrastructure/media/asterisk-rtp-leg"
import { ensurePtime20 } from "../src/infrastructure/media/sdp-transformer"

function opusCodec() {
    return new RTCRtpCodecParameters({ mimeType: "audio/opus", clockRate: 48000, channels: 2, payloadType: 111 })
}

async function waitIceComplete(pc: RTCPeerConnection) {
    if (pc.iceGatheringState === "complete") return
    await new Promise<void>((resolve) => {
        const check = () => { if (pc.iceGatheringState === "complete") resolve() }
        pc.iceGatheringStateChange.subscribe(check)
        setTimeout(resolve, 5000)
    })
}

async function createFakeAgentPeer(onRtp: () => void) {
    const pc = new RTCPeerConnection({ codecs: { audio: [opusCodec()] } })
    const transceiver = pc.addTransceiver("audio", { direction: "sendrecv" })
    transceiver.onTrack.subscribe((track) => {
        track.onReceiveRtp.subscribe(onRtp)
    })
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitIceComplete(pc)
    return { pc, transceiver, offerSdp: pc.localDescription!.sdp }
}

/** Simulasi channel externalMedia Asterisk: socket UDP polos yang mengirim/menerima RTP mentah. */
function createFakeAsterisk(onRtp: (rtp: RtpPacket) => void): Promise<{ socket: dgram.Socket; port: number; sendTo: (port: number, rtp: RtpPacket) => void }> {
    return new Promise((resolve) => {
        const socket = dgram.createSocket("udp4")
        socket.on("message", (msg) => {
            onRtp(RtpPacket.deSerialize(msg))
        })
        socket.bind(0, "127.0.0.1", () => {
            const port = (socket.address() as AddressInfo).port
            resolve({
                socket,
                port,
                sendTo: (targetPort, rtp) => socket.send(rtp.serialize(), targetPort, "127.0.0.1"),
            })
        })
    })
}

describe("MediaSession - full bridge (SIP leg <-> Agent leg)", () => {
    test("forwards RTP bidirectionally between both legs once startForwarding() is called", async () => {
        const wacid = "wacid.BRIDGETEST1"
        const session = new MediaSession(wacid)

        let agentReceived = 0
        let asteriskReceived = 0
        const payloadTypesSeenByAsterisk: number[] = []

        const rtpLeg = await AsteriskRtpLeg.bind()
        session.attachAsteriskLeg(rtpLeg)

        const fakeAsterisk = await createFakeAsterisk((rtp) => {
            asteriskReceived++
            payloadTypesSeenByAsterisk.push(rtp.header.payloadType)
        })

        const { pc: fakeAgent, transceiver: agentTransceiver, offerSdp: agentOfferSdp } =
            await createFakeAgentPeer(() => { agentReceived++ })
        const sessionAnswerToAgent = await session.attachAgent(agentOfferSdp)
        await fakeAgent.setRemoteDescription({ type: "answer", sdp: sessionAnswerToAgent })

        const deadline = Date.now() + 15000
        while (Date.now() < deadline && fakeAgent.connectionState !== "connected") {
            await new Promise((r) => setTimeout(r, 100))
        }
        expect(fakeAgent.connectionState).toBe("connected")

        session.startForwarding()

        // Asterisk menegosiasikan payload type Opus-nya sendiri pada channel externalMedia
        // (107 di produksi), berbeda dari milik leg WebRTC agent (111).
        const ASTERISK_PAYLOAD_TYPE = 107
        const AGENT_PAYLOAD_TYPE = 111

        const payload = Buffer.alloc(160, 0xaa)
        for (let i = 0; i < 10; i++) {
            fakeAsterisk.sendTo(rtpLeg.localPort, new RtpPacket(new RtpHeader({ sequenceNumber: i + 1, timestamp: i * 960, payloadType: ASTERISK_PAYLOAD_TYPE }), payload))
            await agentTransceiver.sender.sendRtp(new RtpPacket(new RtpHeader({ sequenceNumber: i + 500, timestamp: i * 960, payloadType: AGENT_PAYLOAD_TYPE }), payload))
            await new Promise((r) => setTimeout(r, 20))
        }
        await new Promise((r) => setTimeout(r, 500))

        expect(agentReceived).toBeGreaterThanOrEqual(8)
        expect(asteriskReceived).toBeGreaterThanOrEqual(8)
        expect(session.stats.packetsToAgent).toBeGreaterThanOrEqual(8)
        expect(session.stats.packetsToCustomer).toBeGreaterThanOrEqual(8)

        // Audio yang diteruskan ke Asterisk harus memakai payload type milik Asterisk —
        // kalau tidak, Asterisk gagal mendecode dan yang sampai ke pelanggan hanya desis.
        expect(new Set(payloadTypesSeenByAsterisk)).toEqual(new Set([ASTERISK_PAYLOAD_TYPE]))

        fakeAgent.close()
        fakeAsterisk.socket.close()
        await session.close("test_complete")
        expect(session.isClosed).toBe(true)

        const recorded = session.recordings.map((r) => r.track).sort()
        expect(recorded).toEqual(["agent", "customer"])
        await session.discardRecordings()
    }, 20000)
})

describe("sdp-transformer - ensurePtime20", () => {
    test("adds a=ptime:20 and a=maxptime:20 when missing", () => {
        const sdp = [
            "v=0",
            "m=audio 9 UDP/TLS/RTP/SAVPF 111",
            "c=IN IP4 0.0.0.0",
            "a=rtpmap:111 opus/48000/2",
            "",
        ].join("\r\n")

        const result = ensurePtime20(sdp)
        expect(result).toContain("a=ptime:20")
        expect(result).toContain("a=maxptime:20")
    })

    test("leaves SDP untouched when ptime is already present", () => {
        const sdp = [
            "v=0",
            "m=audio 9 UDP/TLS/RTP/SAVPF 111",
            "a=ptime:20",
            "a=maxptime:20",
            "",
        ].join("\r\n")

        expect(ensurePtime20(sdp)).toBe(sdp)
    })
})
