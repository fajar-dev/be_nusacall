import { AppDataSource } from "../config/database"
import { Branch } from "../modules/branch/entities/branch.entity"
import { nusaworkClient } from "../infrastructure/nusawork/nusawork.client"

async function sync() {
    try {
        console.log("[Sync] Starting branch sync from Nusawork...")
        const startTime = Date.now()

        await AppDataSource.initialize()
        console.log("[Sync] App database connected")

        const rawBranches = await nusaworkClient.getBranch()
        const branches = rawBranches.filter(b => Number(b.id_parent) > 0)
        if (branches.length === 0) {
            console.log("[Sync] No branches found from Nusawork")
            await AppDataSource.destroy()
            process.exit(0)
        }

        console.log(`[Sync] Fetched ${rawBranches.length} branches from Nusawork`)

        const repo = AppDataSource.getRepository(Branch)
        const batchSize = 500
        let synced = 0

        for (let i = 0; i < branches.length; i += batchSize) {
            const batch = branches.slice(i, i + batchSize)
            const entities = batch.map(b => {
                return repo.create({
                    id: b.id,
                    code: b.branch_id,
                    name: b.name,
                    email: b.email,
                    phone: b.branch_phone_number,
                    address: b.branch_address,
                })
            })

            await repo.upsert(entities, ["id"])
            synced += entities.length
            console.log(`[Sync] Batch ${Math.floor(i / batchSize) + 1}: upserted ${entities.length} branches`)
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2)
        console.log(`[Sync] Completed in ${duration}s. Synced ${synced} branches.`)

        await AppDataSource.destroy()
        process.exit(0)
    } catch (error) {
        console.error("[Sync] Failed:", error)
        process.exit(1)
    }
}

sync()
