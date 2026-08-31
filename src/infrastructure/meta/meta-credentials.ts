import { AppDataSource } from "../../config/database"
import { Account } from "../../modules/account/entities/account.entity"
import { metaApplications, type MetaApplication } from "../../config/meta-applications"
import { BadGatewayException } from "../../core/exceptions/base"
import { logger } from "../../core/helpers/logger"

const businessAccountByPhoneNumber = new Map<string, string>()

export async function resolveApplication(phoneNumberId: string): Promise<MetaApplication> {
    let businessAccountId = businessAccountByPhoneNumber.get(phoneNumberId)

    if (!businessAccountId) {
        const account = await AppDataSource.getRepository(Account).findOne({
            where: { phoneNumberId },
            select: { id: true, businessAccountId: true },
        })
        if (account?.businessAccountId) {
            businessAccountId = account.businessAccountId
            businessAccountByPhoneNumber.set(phoneNumberId, businessAccountId)
        }
    }

    const application = businessAccountId
        ? metaApplications.forBusinessAccount(businessAccountId)
        : (metaApplications.all.length === 1 ? metaApplications.all[0]! : null)

    if (!application) {
        logger.error("No Meta application configured for this number", { phoneNumberId, businessAccountId })
        throw new BadGatewayException("No Meta application is configured for this phone number")
    }

    return application
}
