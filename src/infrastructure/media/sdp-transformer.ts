/**
 * Validates/normalizes SDP against Meta's mandatory requirements before
 * sending. werift is already compliant by default — this is a safety net,
 * catching a malformed SDP locally instead of a cryptic Meta rejection.
 * See docs/MEDIA-PLANE.md §7.
 */

export class SdpValidationError extends Error {}

/** Ensures `a=ptime:20` (and `a=maxptime:20`) are present; appends them to the audio m-line block if missing. */
export function ensurePtime20(sdp: string, ptimeMs = 20): string {
    const lines = sdp.split("\r\n")
    const hasPtime = lines.some((l) => l.startsWith("a=ptime:"))
    const hasMaxptime = lines.some((l) => l.startsWith("a=maxptime:"))

    if (hasPtime && hasMaxptime) return sdp

    const mLineIndex = lines.findIndex((l) => l.startsWith("m=audio"))
    if (mLineIndex === -1) return sdp // no audio section — nothing to do, let validation below catch it

    const toInsert: string[] = []
    if (!hasPtime) toInsert.push(`a=ptime:${ptimeMs}`)
    if (!hasMaxptime) toInsert.push(`a=maxptime:${ptimeMs}`)

    // Insert right after the audio m-line's c= line if present, else right after m=audio.
    let insertAt = mLineIndex + 1
    while (insertAt < lines.length && lines[insertAt]!.startsWith("c=")) insertAt++

    lines.splice(insertAt, 0, ...toInsert)
    return lines.join("\r\n")
}

export interface SdpValidationResult {
    valid: boolean
    errors: string[]
}

/**
 * Validates outbound SDP against Meta's mandatory requirements before it is
 * sent via pre_accept/accept/connect. Does NOT throw — callers decide
 * whether to reject or log-and-proceed (see `assertValidOutboundSdp`).
 */
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

/** Throws SdpValidationError with all violations joined, if any. */
export function assertValidOutboundSdp(sdp: string): void {
    const result = validateOutboundSdp(sdp)
    if (!result.valid) {
        throw new SdpValidationError(`Outbound SDP failed validation: ${result.errors.join("; ")}`)
    }
}
