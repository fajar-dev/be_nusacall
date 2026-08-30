import { describe, test, expect } from "bun:test"
import { RTCPeerConnection, RTCRtpCodecParameters } from "werift"
import { MediaSession } from "../src/infrastructure/media/media-session"
import { validateOutboundSdp, ensurePtime20 } from "../src/infrastructure/media/sdp-transformer"

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

async function createFakePeer(onRtp: () => void) {
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

describe("MediaSession - acceptMetaOffer", () => {
    test("produces a valid SDP answer satisfying Meta's mandatory requirements", async () => {
        const { pc: fakeMeta, offerSdp } = await createFakePeer(() => {})
        const session = new MediaSession("wacid.MEDIATEST1")

        const answerSdp = await session.acceptMetaOffer(offerSdp)

        const result = validateOutboundSdp(answerSdp)
        expect(result.errors).toEqual([])
        expect(result.valid).toBe(true)

        expect(session.metaAnswerSdp).toBe(answerSdp)

        fakeMeta.close()
        await session.close("test_complete")
    })

    test("throws when the offer SDP is malformed", async () => {
        const session = new MediaSession("wacid.MEDIATEST2")
        await expect(session.acceptMetaOffer("not a valid sdp at all")).rejects.toThrow()
        await session.close("test_complete")
    })
})

describe("MediaSession - full bridge (Meta leg <-> Agent leg)", () => {
    test("forwards RTP bidirectionally between both legs once startForwarding() is called", async () => {
        const wacid = "wacid.BRIDGETEST1"
        const session = new MediaSession(wacid)

        let agentReceived = 0
        let metaReceived = 0

        const { pc: fakeMeta, transceiver: metaTransceiver, offerSdp: metaOfferSdp } =
            await createFakePeer(() => { metaReceived++ })
        const sessionAnswerToMeta = await session.acceptMetaOffer(metaOfferSdp)
        await fakeMeta.setRemoteDescription({ type: "answer", sdp: sessionAnswerToMeta })

        const { pc: fakeAgent, transceiver: agentTransceiver, offerSdp: agentOfferSdp } =
            await createFakePeer(() => { agentReceived++ })
        const sessionAnswerToAgent = await session.attachAgent(agentOfferSdp)
        await fakeAgent.setRemoteDescription({ type: "answer", sdp: sessionAnswerToAgent })

        const deadline = Date.now() + 15000
        while (Date.now() < deadline && (fakeMeta.connectionState !== "connected" || fakeAgent.connectionState !== "connected")) {
            await new Promise((r) => setTimeout(r, 100))
        }
        expect(fakeMeta.connectionState).toBe("connected")
        expect(fakeAgent.connectionState).toBe("connected")

        session.startForwarding()

        const { RtpPacket, RtpHeader } = await import("werift")
        const payload = Buffer.alloc(160, 0xaa)
        for (let i = 0; i < 10; i++) {
            await metaTransceiver.sender.sendRtp(new RtpPacket(new RtpHeader({ sequenceNumber: i + 1, timestamp: i * 960, payloadType: 111 }), payload))
            await agentTransceiver.sender.sendRtp(new RtpPacket(new RtpHeader({ sequenceNumber: i + 500, timestamp: i * 960, payloadType: 111 }), payload))
            await new Promise((r) => setTimeout(r, 20))
        }
        await new Promise((r) => setTimeout(r, 500))

        expect(agentReceived).toBeGreaterThanOrEqual(8)
        expect(metaReceived).toBeGreaterThanOrEqual(8)
        expect(session.stats.packetsToAgent).toBeGreaterThanOrEqual(8)
        expect(session.stats.packetsToMeta).toBeGreaterThanOrEqual(8)

        fakeMeta.close()
        fakeAgent.close()
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

describe("sdp-transformer - validateOutboundSdp", () => {
    test("rejects an SDP with multiple SSRCs", () => {
        const sdp = [
            "v=0",
            "m=audio 9 UDP/TLS/RTP/SAVPF 111",
            "a=fingerprint:sha-256 AA:BB",
            "a=rtpmap:111 opus/48000/2",
            "a=ptime:20",
            "a=ssrc:111 cname:a",
            "a=ssrc:222 cname:b",
            "",
        ].join("\r\n")

        const result = validateOutboundSdp(sdp)
        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes("SSRC"))).toBe(true)
    })

    test("rejects an SDP with no fingerprint or crypto line", () => {
        const sdp = [
            "v=0",
            "m=audio 9 UDP/TLS/RTP/SAVPF 111",
            "a=rtpmap:111 opus/48000/2",
            "a=ptime:20",
            "a=ssrc:111 cname:a",
            "",
        ].join("\r\n")

        const result = validateOutboundSdp(sdp)
        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes("fingerprint"))).toBe(true)
    })

    test("accepts a well-formed SDP", () => {
        const sdp = [
            "v=0",
            "m=audio 9 UDP/TLS/RTP/SAVPF 111",
            "a=fingerprint:sha-256 AA:BB",
            "a=rtpmap:111 opus/48000/2",
            "a=ptime:20",
            "a=ssrc:111 cname:a",
            "",
        ].join("\r\n")

        const result = validateOutboundSdp(sdp)
        expect(result.valid).toBe(true)
        expect(result.errors).toEqual([])
    })
})
