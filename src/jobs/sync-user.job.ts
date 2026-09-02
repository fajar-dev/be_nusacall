import { AppDataSource } from "../config/database"
import { User } from "../modules/user/entities/user.entity"
import { Organization } from "../modules/organization/entities/organization.entity"
import { Branch } from "../modules/branch/entities/branch.entity"
import { nusaworkClient } from "../infrastructure/nusawork/nusawork.client"
import { logger } from "../core/helpers/logger"

async function sync() {
    try {
        logger.info("Starting employee sync from Nusawork...")
        const startTime = Date.now()

        await AppDataSource.initialize()
        logger.info("App database connected")

        const employees = await nusaworkClient.getEmployees()
        if (employees.length === 0) {
            logger.info("No employees found from Nusawork")
            await AppDataSource.destroy()
            process.exit(0)
        }

        logger.info(`Fetched ${employees.length} employees from Nusawork`)

        const repo = AppDataSource.getRepository(User)

        const organizations = await AppDataSource.getRepository(Organization).find()
        const orgIdByName = new Map<string, number>()
        for (const org of organizations) {
            orgIdByName.set(org.name.trim().toLowerCase(), org.id)
        }
        let unmatchedOrgCount = 0

        const branches = await AppDataSource.getRepository(Branch).find()
        const branchIdByCode = new Map<string, number>()
        for (const branch of branches) {
            branchIdByCode.set(String(branch.code).trim().toLowerCase(), branch.id)
        }
        let unmatchedBranchCount = 0

        const dbEmployees = await repo.find()
        const existingByIdMap = new Map<number, User>()
        const existingEmailsMap = new Map<string, User>()
        for (const emp of dbEmployees) {
            existingByIdMap.set(emp.id, emp)
            if (emp.email) {
                existingEmailsMap.set(emp.email.toLowerCase(), emp)
            }
        }

        const batchSize = 500
        let synced = 0

        for (let i = 0; i < employees.length; i += batchSize) {
            const batch = employees.slice(i, i + batchSize)

            for (const emp of batch) {
                if (!emp.email || !emp.email.trim()) continue
                const emailLower = emp.email.trim().toLowerCase()
                const existingWithEmail = existingEmailsMap.get(emailLower)
                if (existingWithEmail && existingWithEmail.id !== emp.user_id) {
                    logger.info(`Found ID change for employee email ${emp.email} (Old ID: ${existingWithEmail.id}, New ID: ${emp.user_id}). Suffixing old record.`)
                    existingWithEmail.email = `${existingWithEmail.email}_old_${existingWithEmail.id}`
                    existingWithEmail.isActive = false
                    await repo.save(existingWithEmail)
                    existingEmailsMap.delete(emailLower)
                }
            }

            const entitiesToSave: User[] = []

            for (const emp of batch) {
                if (!emp.user_id || !emp.email || !emp.email.trim()) {
                    logger.warn(`Skipping employee record from Nusawork (missing user_id or email):`, { user_id: emp.user_id, email: emp.email })
                    continue
                }

                const email = emp.email.trim()
                const orgName = emp.organization_name ? String(emp.organization_name).trim().toLowerCase() : ""
                const organizationId = orgName ? orgIdByName.get(orgName) ?? null : null
                if (orgName && organizationId === null) unmatchedOrgCount++

                const branchCode = emp.branch_id ? String(emp.branch_id).trim().toLowerCase() : ""
                const branchId = branchCode ? branchIdByCode.get(branchCode) ?? null : null
                if (branchCode && branchId === null) unmatchedBranchCount++

                const isActive = emp.active_status ? String(emp.active_status).toLowerCase() === 'active' : false
                const existingUser = existingByIdMap.get(emp.user_id)

                if (existingUser) {
                    existingUser.employeeId = emp.employee_id
                    existingUser.name = emp.full_name
                    existingUser.email = email
                    existingUser.photo = emp.photo_profile ?? undefined
                    existingUser.isActive = isActive
                    existingUser.organizationId = organizationId
                    existingUser.branchId = branchId
                    entitiesToSave.push(existingUser)
                } else {
                    const newUser = repo.create({
                        id: emp.user_id,
                        employeeId: emp.employee_id,
                        name: emp.full_name,
                        email,
                        photo: emp.photo_profile ?? undefined,
                        isActive,
                        organizationId,
                        branchId,
                    })
                    entitiesToSave.push(newUser)
                }
            }

            if (entitiesToSave.length > 0) {
                await repo.save(entitiesToSave)
                synced += entitiesToSave.length
                logger.info(`Batch ${Math.floor(i / batchSize) + 1}: saved ${entitiesToSave.length} employees`)
            }
        }

        if (unmatchedOrgCount > 0) {
            logger.info(`${unmatchedOrgCount} employee(s) had an organization_name with no matching Organization (run sync:organization first, or check for a name mismatch).`)
        }

        if (unmatchedBranchCount > 0) {
            logger.info(`${unmatchedBranchCount} employee(s) had a branch_id with no matching Branch.code (run sync:branch first, or check for a code mismatch).`)
        }

        const nusaworkIds = new Set(employees.map(emp => emp.user_id).filter(Boolean))
        const latestDbEmployees = await repo.find()
        const missingEmployees = latestDbEmployees.filter(emp => !nusaworkIds.has(emp.id) && emp.isActive)
        if (missingEmployees.length > 0) {
            for (const emp of missingEmployees) {
                emp.isActive = false
            }
            await repo.save(missingEmployees)
            logger.info(`Marked ${missingEmployees.length} missing/resigned employees as inactive.`)
        }

        try {
            const { agentSipProvisioningService } = await import("../modules/user/agent-sip-provisioning.service")
            const { endpoints } = await agentSipProvisioningService.syncAll()
            logger.info(`Provisioned ${endpoints} agent SIP endpoints.`)
        } catch (err) {
            logger.error("Agent SIP provisioning failed — employees were still synced", { err })
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2)
        logger.info(`Completed in ${duration}s. Synced ${synced} employees.`)

        await AppDataSource.destroy()
        process.exit(0)
    } catch (error) {
        logger.error("Employee sync failed", { error: (error as any)?.message, stack: (error as any)?.stack })
        process.exit(1)
    }
}

sync()
