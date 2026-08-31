import { createHmac, timingSafeEqual } from "node:crypto"
import { metaApplications } from "../../config/meta-applications"

function matches(rawBody: string, header: string, secret: string): boolean {
    const expected = "sha1=" + createHmac("sha1", secret)
        .update(rawBody)
        .digest("hex")

    const expectedBuf = Buffer.from(expected)
    const headerBuf = Buffer.from(header)

    if (expectedBuf.length !== headerBuf.length) return false

    return timingSafeEqual(expectedBuf, headerBuf)
}

/**
 * Tanda tangan diperiksa terhadap setiap aplikasi yang dikonfigurasi karena
 * pengirimnya baru diketahui setelah payload dibaca, sedangkan pemeriksaan ini
 * harus mendahuluinya.
 */
export function verifyMetaSignature(rawBody: string, header: string | undefined): boolean {
    if (!header) return false
    return metaApplications.all.some((application) => matches(rawBody, header, application.secret))
}
