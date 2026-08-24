import "reflect-metadata"
import { DataSource } from "typeorm"
import { config } from "./config"

import { Call } from "../modules/call/entities/call.entity"
import { CallEvent } from "../modules/call/entities/call-event.entity"
import { NusawaLogQueue } from "../modules/call/entities/nusawa-log-queue.entity"
import { CallRecording } from "../modules/call/entities/call-recording.entity"
import { CallPermission } from "../modules/permission/entities/call-permission.entity"
import { PhoneNumber } from "../modules/phone-number/entities/phone-number.entity"
import { Agent } from "../modules/agent/entities/agent.entity"

/**
 * TypeORM Database Configuration
 * 
 * Access via `AppDataSource` (default) atau `getDataSource()`.
 * Untuk testing, gunakan `setDataSource()` untuk override ke test database.
 */

const defaultDataSource = new DataSource({
    type: "mysql",
    host: config.database.host,
    port: config.database.port,
    username: config.database.user,
    password: config.database.pass,
    database: config.database.name,
    synchronize: config.database.sync,
    // mysql2 defaults to serializing/parsing dates in the process's LOCAL
    // timezone, not the DB's. Since this runs wherever it's deployed (not
    // necessarily UTC), that silently corrupts every datetime round-trip.
    // "Z" forces UTC on both ends, independent of host timezone.
    timezone: "Z",
    entities: [Call, CallEvent, NusawaLogQueue, CallRecording, CallPermission, PhoneNumber, Agent],
    migrations: [],
    subscribers: [],
})

let activeDataSource: DataSource = defaultDataSource

/** Get the active DataSource (default or test-overridden) */
export function getDataSource(): DataSource {
    return activeDataSource
}

/** Override DataSource for testing */
export function setDataSource(ds: DataSource): void {
    activeDataSource = ds
}

/** Reset to default DataSource */
export function resetDataSource(): void {
    activeDataSource = defaultDataSource
}

/**
 * Backward-compatible export.
 * Modules yang sudah import `AppDataSource` tetap bekerja.
 * Proxy mendelegasikan semua akses ke activeDataSource.
 */
export const AppDataSource = new Proxy({} as DataSource, {
    get(_target, prop: string | symbol) {
        const value = (activeDataSource as any)[prop]
        // Bind methods ke DataSource asli agar `this` benar
        if (typeof value === "function") {
            return value.bind(activeDataSource)
        }
        return value
    },
})
