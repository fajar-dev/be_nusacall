import { NusawaClient } from "../../infrastructure/nusawa/nusawa.client"
import { nusawaSessionRegistry } from "../../infrastructure/nusawa/nusawa-session.registry"
import { NusawaContactsResponse } from "../../infrastructure/nusawa/nusawa.types"
import { config } from "../../config/config"
import { UnauthorizedException, ServiceUnavailableException } from "../../core/exceptions/base"
import { logger } from "../../core/helpers/logger"

interface ContactListParams {
    page: number
    limit: number
    search?: string
}

interface CacheEntry {
    response: NusawaContactsResponse
    expiresAt: number
}

/**
 * Read-only proxy over nusawa's contact list — NusaCall owns no contact
 * data of its own. Uses the agent's own nusawa token, cached at login by
 * `NusawaSessionRegistry` (that endpoint is gated behind agent JWT, not an
 * API key). Missing/expired token → ask the agent to log in again.
 */
export class ContactService {
    private readonly cache = new Map<string, CacheEntry>()

    constructor(private readonly nusawaClient: NusawaClient) {}

    async getAll(username: string, params: ContactListParams): Promise<NusawaContactsResponse> {
        const cacheKey = `${username}:${params.page}:${params.limit}:${params.search ?? ""}`
        const cached = this.cache.get(cacheKey)
        if (cached && cached.expiresAt > Date.now()) {
            return cached.response
        }

        const nusawaToken = nusawaSessionRegistry.get(username)
        if (!nusawaToken) {
            throw new UnauthorizedException("Nusawa session expired — please log in again to view contacts")
        }

        let response: NusawaContactsResponse
        try {
            response = await this.nusawaClient.listContacts(nusawaToken, params)
        } catch (err) {
            const statusCode = (err as { statusCode?: number }).statusCode
            if (statusCode === 401) {
                nusawaSessionRegistry.clear(username)
                throw new UnauthorizedException("Nusawa session expired — please log in again to view contacts")
            }
            logger.error("nusawa is unreachable while listing contacts", { err })
            throw new ServiceUnavailableException("Contact directory (nusawa) is currently unreachable")
        }

        this.cache.set(cacheKey, {
            response,
            expiresAt: Date.now() + config.nusawa.contactCacheTtlSeconds * 1000,
        })

        return response
    }
}
