import { TypeOrmAccountRepository } from "./repositories/account.repository"
import { AccountService } from "./account.service"
import { AccountController } from "./account.controller"
import { metaClient } from "../../infrastructure/meta/meta.client"

const accountRepository = new TypeOrmAccountRepository()
const accountService = new AccountService(accountRepository, metaClient)
export const accountController = new AccountController(accountService)
