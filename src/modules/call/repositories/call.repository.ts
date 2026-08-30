import { EntityManager } from "typeorm"
import { Call } from "../entities/call.entity"
import { CallStatus, TERMINAL_CALL_STATUSES } from "../enum/call-status.enum"
import { ICallRepository, CallListFilter } from "../interfaces/call.repository.interface"
import { SortOrder } from "../../../core/interfaces/base.repository.interface"
import { BaseRepository } from "../../../core/repositories/base.repository"

const SORTABLE_COLUMNS: Record<string, string> = {
    createdAt: "call.createdAt",
    answeredAt: "call.answeredAt",
    endedAt: "call.endedAt",
    durationSeconds: "call.durationSeconds",
}

export class TypeOrmCallRepository extends BaseRepository<Call> implements ICallRepository {
    constructor() {
        super(Call)
    }

    async findAll(
        page: number,
        limit: number,
        filter: CallListFilter,
        sortBy?: string,
        order: SortOrder = "DESC"
    ): Promise<{ data: Call[]; total: number }> {
        const offset = (page - 1) * limit
        const query = this.repository.createQueryBuilder("call")
            .leftJoinAndSelect("call.user", "user")
            .leftJoinAndSelect("user.organization", "organization")
            .leftJoinAndSelect("call.contact", "contact")

        if (filter.q) {
            query.andWhere(
                "(call.waId LIKE :q OR call.contactName LIKE :q OR call.profileName LIKE :q OR call.wacid LIKE :q)",
                { q: `%${filter.q}%` }
            )
        }
        if (filter.status && filter.status.length > 0) {
            query.andWhere("call.status IN (:...status)", { status: filter.status })
        }
        if (filter.direction) {
            query.andWhere("call.direction = :direction", { direction: filter.direction })
        }
        if (filter.userId) {
            query.andWhere("call.userId = :userId", { userId: filter.userId })
        }
        if (filter.phoneNumberId) {
            query.andWhere("call.phoneNumberId = :phoneNumberId", { phoneNumberId: filter.phoneNumberId })
        }
        if (filter.from) {
            query.andWhere("call.createdAt >= :from", { from: filter.from })
        }
        if (filter.to) {
            query.andWhere("call.createdAt <= :to", { to: filter.to })
        }

        const total = await query.getCount()
        const orderColumn = (sortBy && SORTABLE_COLUMNS[sortBy]) || "call.createdAt"
        const data = await query.orderBy(orderColumn, order).skip(offset).take(limit).getMany()

        return { data, total }
    }

    async findById(id: number): Promise<Call | null> {
        return await this.repository.findOne({ where: { id }, relations: { user: { organization: true }, contact: true } })
    }

    async findByWacid(wacid: string): Promise<Call | null> {
        return await this.repository.findOne({ where: { wacid }, relations: { user: { organization: true }, contact: true } })
    }

    async updateIfRankLower(
        wacid: string,
        nextStatus: CallStatus,
        nextRank: number,
        patch: Partial<Call>,
        manager?: EntityManager
    ): Promise<number> {
        const runner = manager ? manager.getRepository(Call) : this.repository

        const patchable: Record<string, unknown> = { ...patch }
        delete patchable.id
        delete patchable.wacid
        delete patchable.status
        delete patchable.statusRank
        for (const key of Object.keys(patchable)) {
            if (patchable[key] === undefined) delete patchable[key]
        }

        const result = await runner
            .createQueryBuilder()
            .update(Call)
            .set({ status: nextStatus, statusRank: nextRank, ...patchable })
            .where("wacid = :wacid AND statusRank < :nextRank", { wacid, nextRank })
            .execute()

        return result.affected ?? 0
    }

    async findOrCreateByWacid(wacid: string, defaults: Partial<Call>, manager?: EntityManager): Promise<Call> {
        const runner = manager ? manager.getRepository(Call) : this.repository

        const existing = await runner.findOne({ where: { wacid }, relations: { user: { organization: true }, contact: true } })
        if (existing) return existing

        try {
            return await runner.save({ wacid, ...defaults })
        } catch (err) {
            const raced = await runner.findOneBy({ wacid })
            if (raced) return raced
            throw err
        }
    }

    async findStaleActive(olderThanMinutes: number): Promise<Call[]> {
        const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000)
        return await this.repository
            .createQueryBuilder("call")
            .where("call.status NOT IN (:...terminal)", { terminal: TERMINAL_CALL_STATUSES })
            .andWhere("call.createdAt < :cutoff", { cutoff })
            .getMany()
    }

    async getStats(filter: { phoneNumberId?: string; from?: string; to?: string }) {
        const query = this.repository.createQueryBuilder("call")

        if (filter.phoneNumberId) query.andWhere("call.phoneNumberId = :pn", { pn: filter.phoneNumberId })
        if (filter.from) query.andWhere("call.createdAt >= :from", { from: filter.from })
        if (filter.to) query.andWhere("call.createdAt <= :to", { to: filter.to })

        const rows = await query.getMany()

        const total = rows.length
        const answered = rows.filter((r) => r.status === CallStatus.COMPLETED).length
        const missed = rows.filter((r) => r.status === CallStatus.MISSED).length
        const rejected = rows.filter((r) => r.status === CallStatus.REJECTED).length
        const failed = rows.filter((r) => r.status === CallStatus.FAILED).length

        const durations = rows.map((r) => r.durationSeconds).filter((v): v is number => v != null)
        const setups = rows.map((r) => r.setupDurationMs).filter((v): v is number => v != null)

        const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

        return {
            total,
            answered,
            missed,
            rejected,
            failed,
            avgDurationSeconds: avg(durations),
            avgSetupMs: avg(setups),
        }
    }
}
