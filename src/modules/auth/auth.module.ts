import { nusawaClient } from "../../infrastructure/nusawa/nusawa.client"
import { agentService } from "../agent/agent.module"
import { AuthService } from "./auth.service"
import { AuthController } from "./auth.controller"

const authService = new AuthService(nusawaClient, agentService)

export const authController = new AuthController(authService)
