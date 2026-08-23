import "reflect-metadata"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { DataSource } from "typeorm"
import { User } from "../src/modules/user/entities/user.entity"
import { Contact } from "../src/modules/contact/entities/contact.entity"
import { ApiResponse } from "../src/core/helpers/response"
import { BaseException, ValidationException } from "../src/core/exceptions/base"
import { ZodError } from "zod"
import { config } from "../src/config/config"
import { setDataSource } from "../src/config/database"
import { languageMiddleware } from "../src/core/middlewares/language.middleware"
import { requestLogger } from "../src/core/middlewares/logger.middleware"

// ── Test Database ───────────────────────────────────────────────────────────
// Uses real database with a separate test database name
// Ensure DB_TEST_NAME database exists before running tests

const testDbName = process.env.DB_TEST_NAME || "hono_be_test"
const dbType = (process.env.DB_TYPE || config.database.type) as "postgres" | "mysql"

const TestDataSource = new DataSource({
    type: dbType,
    host: config.database.host,
    port: config.database.port,
    username: config.database.user,
    password: config.database.pass,
    database: testDbName,
    synchronize: true,
    dropSchema: true,
    entities: [User, Contact],
    logging: false,
})

// ── Database Lifecycle ──────────────────────────────────────────────────────

export async function initTestDatabase() {
    if (!TestDataSource.isInitialized) {
        await TestDataSource.initialize()
    }
    // Override the global AppDataSource so all modules use TestDataSource
    setDataSource(TestDataSource)
}

export async function destroyTestDatabase() {
    if (TestDataSource.isInitialized) {
        await TestDataSource.destroy()
    }
}

export async function cleanTestDatabase() {
    if (!TestDataSource.isInitialized) return

    const queryRunner = TestDataSource.createQueryRunner()
    try {
        if (dbType === "postgres") {
            await queryRunner.query("SET session_replication_role = 'replica'")
        } else {
            await queryRunner.query("SET FOREIGN_KEY_CHECKS = 0")
        }

        const entities = TestDataSource.entityMetadatas
        for (const entity of entities) {
            const quote = dbType === "postgres" ? '"' : '`'
            await queryRunner.query(`DELETE FROM ${quote}${entity.tableName}${quote}`)
        }

        if (dbType === "postgres") {
            await queryRunner.query("SET session_replication_role = 'origin'")
        } else {
            await queryRunner.query("SET FOREIGN_KEY_CHECKS = 1")
        }
    } finally {
        await queryRunner.release()
    }
}

// ── Test App Factory ────────────────────────────────────────────────────────

/**
 * Creates a fresh Hono app with all routes, using TestDataSource.
 * Must be called AFTER initTestDatabase().
 */
export function createTestApp(): Hono {
    // Import routes — they use AppDataSource which is now TestDataSource
    const api = require("../src/routes/api").default

    const app = new Hono()

    app.use("*", requestLogger)
    app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }))
    app.use("*", languageMiddleware)
    app.route("/api", api)

    // Global Error Handler (matches production)
    app.onError((err, c) => {
        if (err instanceof ZodError) {
            const valErr = new ValidationException(err)
            return ApiResponse.error(c, valErr.message, valErr.status, valErr.context)
        }

        if (err instanceof BaseException) {
            return ApiResponse.error(c, err.message, err.status, err.context)
        }

        return ApiResponse.error(c, "Internal Server Error", 500, {
            message: err.message,
            stack: err.stack,
        })
    })

    return app
}

// ── Request Helper ──────────────────────────────────────────────────────────

interface RequestOptions {
    method?: string
    headers?: Record<string, string>
    body?: any
}

export async function request(app: Hono, path: string, options: RequestOptions = {}) {
    const { method = "GET", headers = {}, body } = options

    const init: RequestInit = {
        method,
        headers: { "Content-Type": "application/json", ...headers },
    }

    if (body) {
        init.body = JSON.stringify(body)
    }

    const res = await app.request(path, init)
    const json = await res.json() as any

    return { status: res.status, body: json, headers: res.headers }
}

// ── Auth Helper ─────────────────────────────────────────────────────────────

export async function registerAndLogin(
    app: Hono,
    userData = { name: "Test User", email: "test@example.com", password: "password123" }
) {
    const { userService } = require("../src/modules/user/user.module")
    const existing = await userService.getByEmail(userData.email)
    if (!existing) {
        await userService.create({ ...userData })
    }

    // Login
    const loginRes = await request(app, "/api/auth/login", {
        method: "POST",
        body: { email: userData.email, password: userData.password },
    })
    if (!loginRes.body.success) {
        throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`)
    }

    return {
        accessToken: loginRes.body.data.accessToken,
        refreshToken: loginRes.body.data.refreshToken,
        headers: { Authorization: `Bearer ${loginRes.body.data.accessToken}` },
        user: loginRes.body.data.user,
    }
}


