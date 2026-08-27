import { AppDataSource } from "../config/database"
import { Organization } from "../modules/organization/entities/organization.entity"
import { flattenNusaworkOrganizations } from "../modules/organization/organization-tree"
import { nusaworkClient } from "../infrastructure/nusawork/nusawork.client"
import { logger } from "../core/helpers/logger"

async function sync() {
    try {
        logger.info("Starting organization sync from Nusawork...")
        const startTime = Date.now()

        await AppDataSource.initialize()
        logger.info("App database connected")

        const nodes = await nusaworkClient.getOrganization()
        if (nodes.length === 0) {
            logger.info("No organizations found from Nusawork")
            await AppDataSource.destroy()
            process.exit(0)
        }

        // The API repeats every node both top-level and nested under each ancestor's `childs` —
        // flatten to unique-by-id rows before touching the database.
        const rows = flattenNusaworkOrganizations(nodes)
        logger.info(`Fetched ${rows.length} unique organizations from Nusawork`)

        const repo = AppDataSource.getRepository(Organization)
        const batchSize = 500

        // Pass 1: upsert every row with parentId stripped, so the self-referencing FK never
        // points at a row that doesn't exist yet — input order isn't guaranteed parent-before-child.
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize).map(r => repo.create({ ...r, parentId: null }))
            await repo.upsert(batch, ["id"])
        }

        // Pass 2: every id now exists, so it's safe to set the real parentId.
        let synced = 0
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize).map(r => repo.create(r))
            await repo.upsert(batch, ["id"])
            synced += batch.length
            logger.info(`Batch ${Math.floor(i / batchSize) + 1}: upserted ${batch.length} organizations`)
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2)
        logger.info(`Completed in ${duration}s. Synced ${synced} organizations.`)

        await AppDataSource.destroy()
        process.exit(0)
    } catch (error) {
        logger.error("Organization sync failed", { error: (error as any)?.message, stack: (error as any)?.stack })
        process.exit(1)
    }
}

sync()