import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { logger } from "../core/helpers/logger"

const DEFAULT_API_URL = "https://graph.facebook.com/v23.0"

export interface MetaApplication {
    id: string
    name: string
    secret: string
    verifyToken: string
    accessToken: string
    apiUrl: string
    businessAccountIds: string[]
}

interface RawBusinessAccount {
    id?: string
    name?: string
}

interface RawApplication {
    id?: string
    name?: string
    secret?: string
    verify_token?: string
    access_token?: string
    api_url?: string
    whatsapp_business_accounts?: RawBusinessAccount[]
}

function fromFile(path: string): MetaApplication[] {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as { applications?: RawApplication[] }
    const applications = parsed.applications ?? []

    return applications.flatMap((app, index) => {
        if (!app.access_token || !app.secret) {
            logger.error("Meta application skipped — access_token and secret are required", { index, name: app.name })
            return []
        }
        return [{
            id: app.id ?? "",
            name: app.name ?? `application-${index}`,
            secret: app.secret,
            verifyToken: app.verify_token ?? "",
            accessToken: app.access_token,
            apiUrl: app.api_url ?? DEFAULT_API_URL,
            businessAccountIds: (app.whatsapp_business_accounts ?? [])
                .map((account) => account.id)
                .filter((id): id is string => Boolean(id)),
        }]
    })
}

class MetaApplicationRegistry {
    private applications: MetaApplication[] = []
    private byBusinessAccount = new Map<string, MetaApplication>()

    load(): void {
        const path = process.env.META_CONFIG_PATH || resolve(process.cwd(), "configs/meta.json")

        if (!existsSync(path)) {
            throw new Error(`Meta configuration not found at ${path}. Salin configs/meta.example.json menjadi configs/meta.json lalu isi kredensialnya.`)
        }

        this.applications = fromFile(path)

        if (this.applications.length === 0) {
            throw new Error(`No usable Meta application in ${path}. Tiap aplikasi wajib memiliki access_token dan secret.`)
        }

        this.byBusinessAccount.clear()
        for (const application of this.applications) {
            for (const businessAccountId of application.businessAccountIds) {
                this.byBusinessAccount.set(businessAccountId, application)
            }
        }

        logger.info("Meta applications loaded", {
            source: path,
            applications: this.applications.length,
            businessAccounts: this.byBusinessAccount.size,
        })
    }

    get all(): MetaApplication[] {
        return this.applications
    }

    forBusinessAccount(businessAccountId: string): MetaApplication | null {
        const matched = this.byBusinessAccount.get(businessAccountId)
        if (matched) return matched
        return this.applications.length === 1 ? this.applications[0]! : null
    }

    verifyTokenMatches(token: string): boolean {
        return this.applications.some((application) => application.verifyToken && application.verifyToken === token)
    }
}

export const metaApplications = new MetaApplicationRegistry()
