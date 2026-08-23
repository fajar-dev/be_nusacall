import "reflect-metadata"
import { DataSource } from "typeorm"
import { User } from "../modules/user/entities/user.entity"
import { Contact } from "../modules/contact/entities/contact.entity"
import { config } from "./config"

/**
 * TypeORM Database Configuration
 * 
 * Access via `AppDataSource` (default) atau `getDataSource()`.
 * Untuk testing, gunakan `setDataSource()` untuk override ke test database.
 */

const defaultDataSource = new DataSource({
    type: config.database.type,
    host: config.database.host,
    port: config.database.port,
    username: config.database.user,
    password: config.database.pass,
    database: config.database.name,
    synchronize: config.database.sync,
    entities: [User, Contact],
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
