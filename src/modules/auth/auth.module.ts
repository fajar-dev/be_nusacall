import { userService } from "../user/user.module"
import { AuthService } from "./auth.service"
import { AuthController } from "./auth.controller"

const authService = new AuthService(userService)

export const authController = new AuthController(authService)
