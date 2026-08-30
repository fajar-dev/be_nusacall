import "reflect-metadata"
import { DataSource } from "typeorm"
import { config } from "./config"

import { Call } from "../modules/call/entities/call.entity"
import { CallEvent } from "../modules/call/entities/call-event.entity"
import { NusawaLogQueue } from "../modules/call/entities/nusawa-log-queue.entity"
import { CallRecording } from "../modules/call/entities/call-recording.entity"
import { CallPermission } from "../modules/permission/entities/call-permission.entity"
import { Account } from "../modules/account/entities/account.entity"
import { User } from "../modules/user/entities/user.entity"
import { Organization } from "../modules/organization/entities/organization.entity"
import { Contact } from "../modules/contact/entities/contact.entity"
import { Branch } from "../modules/branch/entities/branch.entity"

const defaultDataSource = new DataSource({
    type: "mysql",
    host: config.database.host,
    port: config.database.port,
    username: config.database.user,
    password: config.database.pass,
    database: config.database.name,
    synchronize: config.database.sync,
    timezone: "Z",
    entities: [Call, CallEvent, NusawaLogQueue, CallRecording, CallPermission, Account, User, Organization, Contact, Branch],
    migrations: [],
    subscribers: [],
})

let activeDataSource: DataSource = defaultDataSource

export function getDataSource(): DataSource {
    return activeDataSource
}

export function setDataSource(ds: DataSource): void {
    activeDataSource = ds
}

export const AppDataSource = new Proxy({} as DataSource, {
    get(_target, prop: string | symbol) {
        const value = (activeDataSource as any)[prop]
        if (typeof value === "function") {
            return value.bind(activeDataSource)
        }
        return value
    },
})
