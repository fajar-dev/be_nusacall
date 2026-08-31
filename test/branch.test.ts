import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import { initTestDatabase, destroyTestDatabase, cleanTestDatabase, createTestApp, request, createUserAndToken } from "./setup"
import { getDataSource } from "../src/config/database"
import { Branch } from "../src/modules/branch/entities/branch.entity"

let app: Hono

beforeAll(async () => {
    await initTestDatabase()
    app = createTestApp()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
})

async function seedBranch(code: string, name: string) {
    return await getDataSource().getRepository(Branch).save({ code, name })
}

describe("GET /api/branch/list", () => {
    test("menolak permintaan tanpa autentikasi", async () => {
        const { status } = await request(app, "/api/branch/list")
        expect(status).toBe(401)
    })

    test("mengembalikan daftar ringkas berisi id dan nama saja", async () => {
        const { headers } = await createUserAndToken()
        await seedBranch("020", "Nusanet Medan")

        const { status, body } = await request(app, "/api/branch/list", { headers })

        expect(status).toBe(200)
        expect(body.data).toHaveLength(1)
        expect(Object.keys(body.data[0]).sort()).toEqual(["id", "name"])
        expect(body.data[0].name).toBe("Nusanet Medan")
    })

    test("mengembalikan array kosong ketika belum ada cabang", async () => {
        const { headers } = await createUserAndToken()

        const { status, body } = await request(app, "/api/branch/list", { headers })

        expect(status).toBe(200)
        expect(body.data).toEqual([])
    })
})
