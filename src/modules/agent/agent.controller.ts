import { Context } from "hono"
import { AgentService } from "./agent.service"
import { AgentSerializer } from "./serializers/agent.serialize"
import { ApiResponse } from "../../core/helpers/response"
import { presenceRegistry } from "./presence.registry"
import type { Agent } from "./entities/agent.entity"

export class AgentController {
    constructor(private readonly service: AgentService) {}

    async index(c: Context) {
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const q = c.req.query("q") || ""

        const { data, total } = await this.service.getAll(page, limit, q)

        return ApiResponse.paginate(c, AgentSerializer.collection(data), total, page, limit)
    }

    async available(c: Context) {
        const data = await this.service.getAvailableForCalls()
        const onlyOnline = data.filter((a) => presenceRegistry.isAvailable(a.username))
        return ApiResponse.success(c, AgentSerializer.collection(onlyOnline))
    }

    async me(c: Context) {
        const agent = c.get("agent") as Agent
        return ApiResponse.success(c, AgentSerializer.single(agent))
    }

    async update(c: Context) {
        const username = c.req.param("username")!
        const data = c.req.valid("json" as never) as { canReceiveCalls: boolean }
        const agent = await this.service.setCanReceiveCalls(username, data.canReceiveCalls)
        return ApiResponse.success(c, AgentSerializer.single(agent), "Agent updated successfully")
    }

    async setMyAvailability(c: Context) {
        const agent = c.get("agent") as Agent
        const data = c.req.valid("json" as never) as { availability: "available" | "busy" | "away" | "offline" }
        presenceRegistry.setAvailability(agent.username, data.availability)
        return ApiResponse.success(c, { availability: data.availability }, "Availability updated")
    }
}
