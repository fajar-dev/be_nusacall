import { BranchRepository } from "./repositories/branch.repository"
import { BranchService } from "./branch.service"
import { BranchController } from "./branch.controller"

const branchRepository = new BranchRepository()
export const branchService = new BranchService(branchRepository)

export const branchController = new BranchController(branchService)
