import { TypeOrmAgentRepository } from "./repositories/agent.repository"
import { AgentService } from "./agent.service"
import { AgentController } from "./agent.controller"

const agentRepository = new TypeOrmAgentRepository()
const agentService = new AgentService(agentRepository)

export const agentController = new AgentController(agentService)
export { agentService }
