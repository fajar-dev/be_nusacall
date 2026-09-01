import { TypeOrmAccountRepository } from "./repositories/account.repository"
import { AccountService } from "./account.service"
import { AccountController } from "./account.controller"
import { metaClient } from "../../infrastructure/meta/meta.client"

export const accountRepository = new TypeOrmAccountRepository()
export const accountService = new AccountService(accountRepository, metaClient)
export const accountController = new AccountController(accountService)
