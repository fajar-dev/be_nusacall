import { Branch } from "../entities/branch.entity"

export class BranchSerializer {
    static single(branch: Branch) {
        return {
            id: branch.id,
            code: branch.code,
            name: branch.name,
            description: branch.description || null,
            address: branch.address || null,
            email: branch.email || null,
            phone: branch.phone || null,
            createdAt: branch.createdAt,
            updatedAt: branch.updatedAt,
        }
    }

    static collection(branches: Branch[]) {
        return branches.map(b => this.single(b))
    }

    static listItem(branch: Branch) {
        return { id: branch.id, name: branch.name }
    }

    static listCollection(branches: Branch[]) {
        return branches.map(b => this.listItem(b))
    }
}
