const OGG_CAPTURE_PATTERN = Buffer.from("OggS", "ascii")
const HEADER_TYPE_BOS = 0x02
const HEADER_TYPE_EOS = 0x04
const MAX_SEGMENTS_PER_PAGE = 255
const OPUS_SAMPLE_RATE = 48000
const OPUS_PRE_SKIP = 3840

const crcTable = (() => {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
        let r = i << 24
        for (let j = 0; j < 8; j++) {
            r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0
        }
        table[i] = r >>> 0
    }
    return table
})()

function oggCrc32(buf: Buffer): number {
    let crc = 0
    for (const byte of buf) {
        crc = ((crc << 8) ^ crcTable[((crc >>> 24) ^ byte) & 0xff]!) >>> 0
    }
    return crc >>> 0
}

/**
 * Serialises Opus packets into an Ogg stream per RFC 7845. Packets are copied
 * verbatim — the RTP payload is already Opus, so nothing is re-encoded.
 */
export class OggOpusWriter {
    private readonly serialNumber: number
    private pageSequence = 0
    private granulePosition = 0

    private pendingPackets: Buffer[] = []
    private pendingSamples = 0

    constructor(private readonly channels: number, private readonly onPage: (page: Buffer) => void) {
        this.serialNumber = Math.floor(Math.random() * 0xffffffff) >>> 0
        this.writeIdentificationHeader()
        this.writeCommentHeader()
    }

    private buildPage(segments: number[], payload: Buffer, headerType: number, granule: number): Buffer {
        const header = Buffer.alloc(27 + segments.length)
        OGG_CAPTURE_PATTERN.copy(header, 0)
        header.writeUInt8(0, 4)
        header.writeUInt8(headerType, 5)
        header.writeBigInt64LE(BigInt(granule), 6)
        header.writeUInt32LE(this.serialNumber, 14)
        header.writeUInt32LE(this.pageSequence++, 18)
        header.writeUInt32LE(0, 22)
        header.writeUInt8(segments.length, 26)
        for (let i = 0; i < segments.length; i++) header.writeUInt8(segments[i]!, 27 + i)

        const page = Buffer.concat([header, payload])
        page.writeUInt32LE(oggCrc32(page), 22)
        return page
    }

    private lacing(packet: Buffer): number[] {
        const segments: number[] = []
        let remaining = packet.length
        while (remaining >= 255) {
            segments.push(255)
            remaining -= 255
        }
        segments.push(remaining)
        return segments
    }

    private writeSinglePacketPage(packet: Buffer, headerType: number, granule: number): void {
        this.onPage(this.buildPage(this.lacing(packet), packet, headerType, granule))
    }

    private writeIdentificationHeader(): void {
        const head = Buffer.alloc(19)
        head.write("OpusHead", 0, "ascii")
        head.writeUInt8(1, 8)
        head.writeUInt8(this.channels, 9)
        head.writeUInt16LE(OPUS_PRE_SKIP, 10)
        head.writeUInt32LE(OPUS_SAMPLE_RATE, 12)
        head.writeInt16LE(0, 16)
        head.writeUInt8(0, 18)
        this.writeSinglePacketPage(head, HEADER_TYPE_BOS, 0)
    }

    private writeCommentHeader(): void {
        const vendor = Buffer.from("nusacall", "utf-8")
        const tags = Buffer.alloc(8 + 4 + vendor.length + 4)
        tags.write("OpusTags", 0, "ascii")
        tags.writeUInt32LE(vendor.length, 8)
        vendor.copy(tags, 12)
        tags.writeUInt32LE(0, 12 + vendor.length)
        this.writeSinglePacketPage(tags, 0, 0)
    }

    /** `samples` is the packet's duration in 48 kHz samples (960 for a 20 ms frame). */
    write(packet: Buffer, samples: number): void {
        this.pendingPackets.push(packet)
        this.pendingSamples += samples

        const segmentCount = this.pendingPackets.reduce((sum, p) => sum + this.lacing(p).length, 0)
        if (segmentCount >= MAX_SEGMENTS_PER_PAGE - 8) this.flushPage(false)
    }

    private flushPage(eos: boolean): void {
        if (!this.pendingPackets.length) {
            if (eos) this.onPage(this.buildPage([0], Buffer.alloc(0), HEADER_TYPE_EOS, this.granulePosition))
            return
        }

        const segments: number[] = []
        for (const packet of this.pendingPackets) segments.push(...this.lacing(packet))

        this.granulePosition += this.pendingSamples
        const payload = Buffer.concat(this.pendingPackets)
        this.onPage(this.buildPage(segments, payload, eos ? HEADER_TYPE_EOS : 0, this.granulePosition))

        this.pendingPackets = []
        this.pendingSamples = 0
    }

    finish(): void {
        this.flushPage(true)
    }

    get durationSeconds(): number {
        return this.granulePosition / OPUS_SAMPLE_RATE
    }

    get isEmpty(): boolean {
        return this.granulePosition === 0 && this.pendingPackets.length === 0
    }
}

export const OPUS_FRAME_SAMPLES_20MS = 960