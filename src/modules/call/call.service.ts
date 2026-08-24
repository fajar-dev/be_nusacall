import { Call } from "./entities/call.entity"
import { CallStatus } from "./enum/call-status.enum"
import { ICallRepository, CallListFilter } from "./interfaces/call.repository.interface"
import { NotFoundException, ConflictException } from "../../core/exceptions/base"
import { SortOrder } from "../../core/interfaces/base.repository.interface"
import { EndReason } from "./enum/end-reason.enum"

export class CallService {
    constructor(private readonly repository: ICallRepository) {}

    async getAll(
        page: number,
        limit: number,
        filter: CallListFilter,
        sortBy?: string,
        order?: SortOrder
    ): Promise<{ data: Call[]; total: number }> {
        return await this.repository.findAll(page, limit, filter, sortBy, order)
    }

    async getById(id: number): Promise<Call> {
        const call = await this.repository.findById(id)
        if (!call) {
            throw new NotFoundException("Call not found")
        }
        return call
    }

    async getByWacid(wacid: string): Promise<Call> {
        const call = await this.repository.findByWacid(wacid)
        if (!call) {
            throw new NotFoundException("Call not found")
        }
        return call
    }

    async getStats(filter: { phoneNumberId?: string; from?: string; to?: string }) {
        const stats = await this.repository.getStats(filter)
        const answerRate = stats.total > 0 ? stats.answered / stats.total : null
        return { ...stats, answerRate }
    }

    /** Agent rejects a call still RINGING or CONNECTING. */
    async rejectByAgent(id: number, reason?: string): Promise<Call> {
        const call = await this.getById(id)
        if (![CallStatus.RINGING, CallStatus.CONNECTING].includes(call.status)) {
            throw new ConflictException(`Cannot reject a call in status "${call.status}"`)
        }
        // Actual state transition (with rank guard) happens via CallStateService
        // once the Graph API reject call succeeds — this method only validates
        // preconditions before the caller (controller) invokes Meta's API.
        return call
    }

    /** Agent hangs up a call that is ACTIVE. */
    async hangupByAgent(id: number): Promise<Call> {
        const call = await this.getById(id)
        if (call.status !== CallStatus.ACTIVE) {
            throw new ConflictException(`Cannot hang up a call in status "${call.status}"`)
        }
        return call
    }

    async findStaleActive(olderThanMinutes: number): Promise<Call[]> {
        return await this.repository.findStaleActive(olderThanMinutes)
    }

    async reconcileStale(olderThanMinutes: number): Promise<number> {
        const stale = await this.findStaleActive(olderThanMinutes)
        for (const call of stale) {
            await this.repository.save({
                id: call.id,
                status: CallStatus.FAILED,
                statusRank: 90,
                endReason: EndReason.RECONCILED_TIMEOUT,
                endedAt: new Date(),
            })
        }
        return stale.length
    }
}
