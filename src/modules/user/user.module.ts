import { TypeOrmUserRepository } from "./repositories/user.repository"
import { UserService } from "./user.service"
import { UserController } from "./user.controller"

export const userRepository = new TypeOrmUserRepository()
export const userService = new UserService(userRepository)
export const userController = new UserController(userService)
