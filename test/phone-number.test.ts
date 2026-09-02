import { describe, test, expect } from "bun:test"
import { normalizePhoneNumber, toE164 } from "../src/core/helpers/phone-number"

describe("normalizePhoneNumber", () => {
    test("menyeragamkan awalan lokal dan internasional ke satu bentuk", () => {
        expect(normalizePhoneNumber("08116341122")).toBe("628116341122")
        expect(normalizePhoneNumber("+62 811-6341-122")).toBe("628116341122")
        expect(normalizePhoneNumber("0062 8116341122")).toBe("628116341122")
        expect(normalizePhoneNumber("628116341122")).toBe("628116341122")
    })

    test("nomor kosong tetap kosong", () => {
        expect(normalizePhoneNumber("")).toBe("")
        expect(normalizePhoneNumber("-- --")).toBe("")
    })
})

describe("toE164", () => {
    /**
     * Meta membalas 200 OK untuk INVITE tanpa tanda plus tetapi tidak pernah
     * mendering-kan ponsel tujuan — panggilan keluar diam-diam gagal.
     */
    test("selalu menambahkan tanda plus di depan", () => {
        expect(toE164("62895611024559")).toBe("+62895611024559")
        expect(toE164("08956110245 59")).toBe("+62895611024559")
        expect(toE164("+62895611024559")).toBe("+62895611024559")
    })

    test("tidak menghasilkan tanda plus yatim untuk nomor kosong", () => {
        expect(toE164("")).toBe("")
    })
})
