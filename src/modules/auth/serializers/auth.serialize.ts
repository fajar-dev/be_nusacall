import { User } from "../../user/entities/user.entity"
import { resolveFileUrl } from "../../../core/helpers/serializer-utils"

export class AuthSerializer {

    static async single(user: User) {
        return {
            id: user.id,
            employeeId: user.employeeId,
            name: user.name,
            photo: await resolveFileUrl(user.photo),
            email: user.email,
            isActive: Boolean(user.isActive),
            organization: user.organization ? {
                id: user.organization.id,
                name: user.organization.name,
            } : null
        }
    }

    static async collection(users: User[]) {
        return Promise.all(users.map(u => this.single(u)))
    }
}