import { EntityManager } from "typeorm"
import { Call } from "../entities/call.entity"
import { CallStatus } from "../enums/call-status.enum"
import { IBaseRepository, SortOrder } from "../../../core/interfaces/base.repository.interface"

export interface CallListFilter {
    q?: string
    status?: CallStatus[]
    direction?: string
    userId?: number
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
