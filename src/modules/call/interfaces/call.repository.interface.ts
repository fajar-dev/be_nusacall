import { EntityManager } from "typeorm"
import { Call } from "../entities/call.entity"
import { CallStatus } from "../enum/call-status.enum"
import { IBaseRepository, SortOrder } from "../../../core/interfaces/base.repository.interface"

export interface CallListFilter {
    q?: string
    status?: CallStatus[]
    direction?: string
    agentUsername?: string
    phoneNumberId?: string
    from?: string
    to?: string
}

export interface ICallRepository extends IBaseRepository<Call> {
    findAll(
        page: number,
        limit: number,
        filter: CallListFilter,
        sortBy?: string,
        order?: SortOrder
    ): Promise<{ data: Call[]; total: number }>

    findByWacid(wacid: string): Promise<Call | null>

    /**
     * Applies a transition only if `nextRank` > current status_rank (SQL
     * guard, race-safe under concurrent webhooks). Returns rows affected —
     * 0 means rejected as stale/out-of-order. See docs/CALL-LIFECYCLE.md §2.3.
     */
    updateIfRankLower(
        wacid: string,
        nextStatus: CallStatus,
        nextRank: number,
        patch: Partial<Call>,
        manager?: EntityManager
    ): Promise<number>

    findOrCreateByWacid(wacid: string, defaults: Partial<Call>, manager?: EntityManager): Promise<Call>

    findStaleActive(olderThanMinutes: number): Promise<Call[]>

    getStats(filter: { phoneNumberId?: string; from?: string; to?: string }): Promise<{
        total: number
        answered: number
        missed: number
        rejected: number
        failed: number
        avgDurationSeconds: number | null
        avgSetupMs: number | null
    }>
}
