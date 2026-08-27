import "reflect-metadata"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { DataSource } from "typeorm"
import { Call } from "../src/modules/call/entities/call.entity"
import { CallEvent } from "../src/modules/call/entities/call-event.entity"
import { NusawaLogQueue } from "../src/modules/call/entities/nusawa-log-queue.entity"
import { CallRecording } from "../src/modules/call/entities/call-recording.entity"
import { CallPermission } from "../src/modules/permission/entities/call-permission.entity"
import { Account } from "../src/modules/account/entities/account.entity"
import { User } from "../src/modules/user/entities/user.entity"
import { Organization } from "../src/modules/organization/entities/organization.entity"
import { Contact } from "../src/modules/contact/entities/contact.entity"
import { Branch } from "../src/modules/branch/entities/branch.entity"
import { ApiResponse } from "../src/core/helpers/response"
import { BaseException, ValidationException } from "../src/core/exceptions/base"
import { ZodError } from "zod"
import { config } from "../src/config/config"
import { setDataSource } from "../src/config/database"
import { languageMiddleware } from "../src/core/middlewares/language.middleware"
import { requestLogger } from "../src/core/middlewares/logger.middleware"

// Uses a real database with a separate test database name; ensure DB_TEST_NAME exists before running tests.
const testDbName = process.env.DB_TEST_NAME || "nusacall_test"

const TestDataSource = new DataSource({
    type: "mysql",
    host: config.database.host,
    port: config.database.port,
    username: config.database.user,
    password: config.database.pass,
    database: testDbName,
    synchronize: true,
    dropSchema: true,
    timezone: "Z", // see src/config/database.ts — mysql2 defaults to local-time serialization
    entities: [Call, CallEvent, NusawaLogQueue, CallRecording, CallPermission, Account, User, Organization, Contact, Branch],
    logging: false,
})

// Shared in-flight promise guards against two test files both observing isInitialized
// === false and calling initialize() (synchronize+dropSchema) concurrently.
let initPromise: Promise<void> | null = null

export async function initTestDatabase() {
    if (!initPromise) {
        initPromise = TestDataSource.isInitialized ? Promise.resolve() : TestDataSource.initialize().then(() => {})
    }
    await initPromise
    // Override the global AppDataSource so all modules use TestDataSource
    setDataSource(TestDataSource)
}

// Deliberately a no-op: TestDataSource is shared by every test file, so one file's
// afterAll destroying it could pull the connection out from under another still mid-run.
export async function destroyTestDatabase() {
    void TestDataSource
}

export async function cleanTestDatabase() {
    if (!TestDataSource.isInitialized) return

    const queryRunner = TestDataSource.createQueryRunner()
    try {
        await queryRunner.query("SET FOREIGN_KEY_CHECKS = 0")

        const entities = TestDataSource.entityMetadatas
        for (const entity of entities) {
            await queryRunner.query(`DELETE FROM \`${entity.tableName}\``)
        }

        await queryRunner.query("SET FOREIGN_KEY_CHECKS = 1")
    } finally {
        await queryRunner.release()
    }
}

// Must be called AFTER initTestDatabase().
export function createTestApp(): Hono {
    const api = require("../src/routes/api").default
    const { buildWebhookController } = require("../src/modules/webhook/webhook.module")

    // No-op media coordinator: state-machine tests must never trigger real WebRTC
    // negotiation or Meta Graph API calls. See test/media-session.test.ts for the real
    // MediaSession behavior, tested in isolation with werift.
    const noopMediaCoordinator = {
        establishEarly: async () => ({ ok: true }),
        teardown: async () => {},
    }
    // No-op signaling: webhook tests exercise the state machine, not routing or
    // WebSocket delivery. See test/call-signaling.test.ts for that behavior.
    const noopSignaling = { notifyIncoming: async () => {}, logCallOutcome: async () => {}, notifyCallEnded: () => {} }
    const webhookController = buildWebhookController(noopMediaCoordinator, noopSignaling)

    const app = new Hono()

    app.use("*", requestLogger)
    app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }))
    app.use("*", languageMiddleware)

    app.get("/wh", (c) => webhookController.verify(c))
    app.post("/wh", (c) => webhookController.receive(c))

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

interface RequestOptions {
    method?: string
    headers?: Record<string, string>
    body?: any
    rawBody?: string
}

export async function request(app: Hono, path: string, options: RequestOptions = {}) {
    const { method = "GET", headers = {}, body, rawBody } = options

    const init: RequestInit = {
        method,
        headers: { "Content-Type": "application/json", ...headers },
    }

    if (rawBody !== undefined) {
        init.body = rawBody
    } else if (body) {
        init.body = JSON.stringify(body)
    }

    const res = await app.request(path, init)
    const contentType = res.headers.get("content-type") || ""
    const isJson = contentType.includes("application/json")
    const json = isJson ? await res.json() as any : null

    return { status: res.status, body: json, headers: res.headers }
}

// Signs the token the same way AuthHelper.generateTokens does in production, bypassing
// Nusawork/Google entirely — for tests that don't exercise the login flow itself (see test/auth.test.ts).
export async function createUserAndToken(overrides: Partial<{ email: string; role: string; isActive: boolean; employeeId: number }> = {}) {
    const { UserService } = require("../src/modules/user/user.service")
    const { UserRepository } = require("../src/modules/user/repositories/user.repository")
    const { AuthHelper } = require("../src/core/helpers/auth")
    const { Role } = require("../src/modules/user/enums/role.enum")

    const userService = new (UserService as new (repo: unknown) => { save: (data: unknown) => Promise<any> })(new UserRepository())
    const email = overrides.email || `user${Date.now()}${Math.floor(Math.random() * 1000)}@nusa.id`

    const user = await userService.save({
        email,
        name: "Test User",
        employeeId: overrides.employeeId ?? Math.floor(Math.random() * 1_000_000),
        role: overrides.role ?? Role.AGENT,
        isActive: overrides.isActive ?? true,
    })

    const { accessToken } = await AuthHelper.generateTokens(user)

    return { user, accessToken, headers: { Authorization: `Bearer ${accessToken}` } }
}
