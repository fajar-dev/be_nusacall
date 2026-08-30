
class SdpValidationError extends Error {}

export function ensurePtime20(sdp: string, ptimeMs = 20): string {
    const lines = sdp.split("\r\n")
    const hasPtime = lines.some((l) => l.startsWith("a=ptime:"))
    const hasMaxptime = lines.some((l) => l.startsWith("a=maxptime:"))

    if (hasPtime && hasMaxptime) return sdp

    const mLineIndex = lines.findIndex((l) => l.startsWith("m=audio"))
    if (mLineIndex === -1) return sdp 

    const toInsert: string[] = []
    if (!hasPtime) toInsert.push(`a=ptime:${ptimeMs}`)
    if (!hasMaxptime) toInsert.push(`a=maxptime:${ptimeMs}`)

    let insertAt = mLineIndex + 1
    while (insertAt < lines.length && lines[insertAt]!.startsWith("c=")) insertAt++

    lines.splice(insertAt, 0, ...toInsert)
    return lines.join("\r\n")
}

export interface SdpValidationResult {
    valid: boolean
    errors: string[]
}

export function validateOutboundSdp(sdp: string): SdpValidationResult {
    const errors: string[] = []
    const lines = sdp.split("\r\n")

    const audioMLines = lines.filter((l) => l.startsWith("m=audio"))
    if (audioMLines.length === 0) {
        errors.push("No m=audio line found")
    } else if (audioMLines.length > 1) {
        errors.push(`Expected exactly 1 audio m-line, found ${audioMLines.length}`)
    }

    const ssrcLines = lines.filter((l) => l.startsWith("a=ssrc:"))
    const distinctSsrcs = new Set(ssrcLines.map((l) => l.split(":")[1]?.split(" ")[0]))
    if (distinctSsrcs.size === 0) {
        errors.push("No a=ssrc line found — Meta requires exactly one SSRC")
    } else if (distinctSsrcs.size > 1) {
        errors.push(`Expected exactly 1 SSRC, found ${distinctSsrcs.size}: ${[...distinctSsrcs].join(", ")}`)
    }

    const hasFingerprint = lines.some((l) => l.startsWith("a=fingerprint:"))
    const hasSdesCrypto = lines.some((l) => l.startsWith("a=crypto:"))
    if (!hasFingerprint && !hasSdesCrypto) {
        errors.push("No a=fingerprint (DTLS) or a=crypto (SDES) line found — required for SRTP key exchange")
    }

    const opusLine = lines.find((l) => /^a=rtpmap:\d+ opus\/48000/i.test(l))
    if (!opusLine) {
        errors.push("No Opus/48000 rtpmap found — Meta requires 48 kHz clock rate for Opus")
    }

    const hasPtime = lines.some((l) => l.startsWith("a=ptime:20"))
    if (!hasPtime) {
        errors.push("Missing a=ptime:20 — Meta requires 20ms packetization")
    }

    return { valid: errors.length === 0, errors }
}

export function assertValidOutboundSdp(sdp: string): void {
    const result = validateOutboundSdp(sdp)
    if (!result.valid) {
        throw new SdpValidationError(`Outbound SDP failed validation: ${result.errors.join("; ")}`)
    }
}
