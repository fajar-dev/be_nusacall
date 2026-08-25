import { createHmac, timingSafeEqual } from "node:crypto"
import { config } from "../../config/config"

/** Must be called with the RAW body string before JSON parsing — Meta signs the exact bytes it sent. */
export function verifyMetaSignature(rawBody: string, header: string | undefined): boolean {
    if (!header) return false

    const expected = "sha1=" + createHmac("sha1", config.meta.appSecret)
        .update(rawBody)
        .digest("hex")

    const expectedBuf = Buffer.from(expected)
    const headerBuf = Buffer.from(header)

    if (expectedBuf.length !== headerBuf.length) return false

    return timingSafeEqual(expectedBuf, headerBuf)
}
