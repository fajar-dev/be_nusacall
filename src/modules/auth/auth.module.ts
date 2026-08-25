import { userService } from "../user/user.module"
import { AuthService } from "./auth.service"
import { NusaworkAuthService } from "./nusawork-auth.service"
import { AuthController } from "./auth.controller"

const authService = new AuthService(userService)
const nusaworkAuthService = new NusaworkAuthService(userService)

export const authController = new AuthController(authService, nusaworkAuthService)
