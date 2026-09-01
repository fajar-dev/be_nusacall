import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createServer, type Server } from "node:http"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase } from "./setup"
import { getDataSource } from "../src/config/database"
import { Account } from "../src/modules/account/entities/account.entity"
import { metaApplications } from "../src/config/meta-applications"
import { resolveApplication } from "../src/infrastructure/meta/meta-credentials"
import { MetaClient } from "../src/infrastructure/meta/meta.client"

let server: Server
let port: number
const diterima: Array<{ url: string; authorization: string | undefined; body: string }> = []
const directories: string[] = []

beforeAll(async () => {
    await initTestDatabase()
    server = createServer((req, res) => {
        let body = ""
        req.on("data", (chunk) => { body += chunk })
        req.on("end", () => {
            diterima.push({ url: req.url ?? "", authorization: req.headers.authorization, body })
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ success: true }))
        })
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    port = (server.address() as { port: number }).port
})

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
    diterima.length = 0
})

afterEach(() => {
    delete process.env.META_CONFIG_PATH
    metaApplications.load()
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function muatKonfigurasi(applications: unknown[]) {
    const directory = mkdtempSync(join(tmpdir(), "nusacall-cred-"))
    directories.push(directory)
    const path = join(directory, "meta.json")
    writeFileSync(path, JSON.stringify({ applications }))
    process.env.META_CONFIG_PATH = path
    metaApplications.load()
}

async function seedAccount(phoneNumberId: string, businessAccountId: string) {
    return await getDataSource().getRepository(Account).save({
        phoneNumberId, businessAccountId, label: `Akun ${phoneNumberId}`, displayPhoneNumber: `62${phoneNumberId}`,
    })
}

function duaAplikasi(baseUrl: string) {
    return [
        { id: "app-satu", name: "Satu", secret: "s1", verify_token: "v1", access_token: "token-satu",
          api_url: baseUrl, whatsapp_business_accounts: [{ id: "wa-100" }] },
        { id: "app-dua", name: "Dua", secret: "s2", verify_token: "v2", access_token: "token-dua",
          api_url: baseUrl, whatsapp_business_accounts: [{ id: "wa-200" }] },
    ]
}

describe("resolveApplication", () => {
    test("memilih aplikasi lewat business_account_id milik nomor di tabel accounts", async () => {
        muatKonfigurasi(duaAplikasi("https://contoh.invalid"))
        await seedAccount("nomor-A", "wa-100")
        await seedAccount("nomor-B", "wa-200")

        expect((await resolveApplication("nomor-A")).accessToken).toBe("token-satu")
        expect((await resolveApplication("nomor-B")).accessToken).toBe("token-dua")
    })

    test("melempar galat ketika nomor tidak terhubung ke aplikasi mana pun", async () => {
        muatKonfigurasi(duaAplikasi("https://contoh.invalid"))
        await seedAccount("nomor-C", "wa-tidak-terdaftar")

        await expect(resolveApplication("nomor-C")).rejects.toThrow()
    })

    test("nomor yang belum ada di tabel accounts tetap jalan bila aplikasinya tunggal", async () => {
        muatKonfigurasi([{ id: "app-satu", name: "Satu", secret: "s", verify_token: "v", access_token: "token-tunggal" }])

        expect((await resolveApplication("nomor-belum-terdaftar")).accessToken).toBe("token-tunggal")
    })
})

describe("MetaClient memakai kredensial pemilik nomor", () => {
    test("mengirim access token dan api_url yang sesuai untuk tiap nomor", async () => {
        const baseUrl = `http://127.0.0.1:${port}`
        muatKonfigurasi(duaAplikasi(baseUrl))
        await seedAccount("nomor-A", "wa-100")
        await seedAccount("nomor-B", "wa-200")

        const client = new MetaClient()
        await client.updateCallSettings("nomor-A", { status: "ENABLED" })
        await client.updateCallSettings("nomor-B", { status: "ENABLED" })

        expect(diterima).toHaveLength(2)
        expect(diterima[0]!.url).toBe("/nomor-A/settings")
        expect(diterima[0]!.authorization).toBe("Bearer token-satu")
        expect(diterima[1]!.url).toBe("/nomor-B/settings")
        expect(diterima[1]!.authorization).toBe("Bearer token-dua")
    })

    test("parameter query tetap terkirim pada permintaan GET", async () => {
        const baseUrl = `http://127.0.0.1:${port}`
        muatKonfigurasi(duaAplikasi(baseUrl))
        await seedAccount("nomor-A", "wa-100")

        await new MetaClient().getCallPermission("nomor-A", "628123456789")

        expect(diterima[0]!.url).toBe("/nomor-A/call_permissions?user_wa_id=628123456789")
        expect(diterima[0]!.authorization).toBe("Bearer token-satu")
    })
})
