const DEFAULT_COUNTRY_CODE = "62"

/**
 * Menyeragamkan nomor ke format internasional tanpa tanda plus, sama seperti
 * yang dikirim Meta, agar nomor yang sama selalu menunjuk ke satu kontak.
 */
export function normalizePhoneNumber(raw: string): string {
    const digits = raw.replace(/\D/g, "")
    if (!digits) return ""
    if (digits.startsWith("00")) return digits.slice(2)
    if (digits.startsWith("0")) return DEFAULT_COUNTRY_CODE + digits.slice(1)
    return digits
}
