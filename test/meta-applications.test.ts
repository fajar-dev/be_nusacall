import { describe, test, expect, afterEach } from "bun:test"
import { writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createHmac } from "node:crypto"
import { metaApplications } from "../src/config/meta-applications"
import { verifyMetaSignature } from "../src/core/helpers/signature"

const directories: string[] = []

afterEach(() => {
    delete process.env.META_CONFIG_PATH
    metaApplications.load()
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function loadFromConfig(applications: unknown[]) {
    const directory = mkdtempSync(join(tmpdir(), "nusacall-meta-"))
    directories.push(directory)
    const path = join(directory, "meta.json")
    writeFileSync(path, JSON.stringify({ applications }))
    process.env.META_CONFIG_PATH = path
    metaApplications.load()
}

const duaAplikasi = [
    {
        id: "app-satu", name: "Satu", secret: "rahasia-satu", verify_token: "verify-satu",
        access_token: "token-satu", api_url: "https://graph.facebook.com/v23.0",
        whatsapp_business_accounts: [{ id: "wa-100", name: "Nusa" }],
    },
    {
        id: "app-dua", name: "Dua", secret: "rahasia-dua", verify_token: "verify-dua",
        access_token: "token-dua", api_url: "https://graph.facebook.com/v23.0",
        whatsapp_business_accounts: [{ id: "wa-200", name: "Antar Nusa" }, { id: "wa-300", name: "Lainnya" }],
    },
]

describe("metaApplications", () => {
    test("memuat seluruh aplikasi beserta business account-nya", () => {
        loadFromConfig(duaAplikasi)

        expect(metaApplications.all).toHaveLength(2)
        expect(metaApplications.all.map(a => a.name).sort()).toEqual(["Dua", "Satu"])
    })

    test("memilih kredensial sesuai business account", () => {
        loadFromConfig(duaAplikasi)

        expect(metaApplications.forBusinessAccount("wa-100")!.accessToken).toBe("token-satu")
        expect(metaApplications.forBusinessAccount("wa-200")!.accessToken).toBe("token-dua")
        expect(metaApplications.forBusinessAccount("wa-300")!.accessToken).toBe("token-dua")
    })

    test("mengembalikan null untuk business account yang tidak terdaftar", () => {
        loadFromConfig(duaAplikasi)

        expect(metaApplications.forBusinessAccount("wa-tidak-ada")).toBeNull()
    })

    test("aplikasi tunggal dipakai apa adanya tanpa perlu mendaftarkan business account", () => {
        loadFromConfig([{ id: "app-satu", name: "Satu", secret: "s", verify_token: "v", access_token: "token-satu" }])

        expect(metaApplications.forBusinessAccount("wa-belum-terdaftar")!.accessToken).toBe("token-satu")
    })

    test("melewati aplikasi tanpa access_token atau secret", () => {
        loadFromConfig([duaAplikasi[0], { id: "rusak", name: "Rusak" }])

        expect(metaApplications.all).toHaveLength(1)
    })

    test("verify token diterima dari aplikasi mana pun", () => {
        loadFromConfig(duaAplikasi)

        expect(metaApplications.verifyTokenMatches("verify-satu")).toBe(true)
        expect(metaApplications.verifyTokenMatches("verify-dua")).toBe(true)
        expect(metaApplications.verifyTokenMatches("verify-salah")).toBe(false)
        expect(metaApplications.verifyTokenMatches("")).toBe(false)
    })
})

describe("verifyMetaSignature dengan banyak aplikasi", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account" })
    const tandaTangan = (secret: string) => "sha1=" + createHmac("sha1", secret).update(body).digest("hex")

    test("menerima tanda tangan dari aplikasi mana pun", () => {
        loadFromConfig(duaAplikasi)

        expect(verifyMetaSignature(body, tandaTangan("rahasia-satu"))).toBe(true)
        expect(verifyMetaSignature(body, tandaTangan("rahasia-dua"))).toBe(true)
    })

    test("menolak tanda tangan dari secret yang tidak dikenal", () => {
        loadFromConfig(duaAplikasi)

        expect(verifyMetaSignature(body, tandaTangan("rahasia-asing"))).toBe(false)
        expect(verifyMetaSignature(body, undefined)).toBe(false)
    })
})
