import { User } from "../entities/user.entity"
import { resolveFileUrl } from "../../../core/helpers/serializer-utils"
import { presenceRegistry } from "../presence.registry"

export class UserSerializer {
    static async summary(user: User) {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            photo: await resolveFileUrl(user.photo),
            organization: user.organization ? { id: user.organization.id, name: user.organization.name } : null,
        }
    }

    static async single(user: User) {
        const presence = presenceRegistry.get(user.email)
        return {
            ...(await this.summary(user)),
            employeeId: user.employeeId,
            isActive: Boolean(user.isActive),
            branch: user.branch ? { id: user.branch.id, name: user.branch.name, code: user.branch.code } : null,
            availability: presence?.availability ?? "offline",
            currentCallId: presence?.currentCallId ?? null,
        }
    }

    static async collection(users: User[]) {
        return Promise.all(users.map(user => this.single(user)))
    }
}
