import { UserRepository } from "./repositories/user.repository"
import { UserService } from "./user.service"
import { UserController } from "./user.controller"

export const userRepository = new UserRepository()
export const userService = new UserService(userRepository)
export const userController = new UserController(userService)
