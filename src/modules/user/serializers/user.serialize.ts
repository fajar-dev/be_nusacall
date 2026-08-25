import { User } from "../entities/user.entity"
import { resolveFileUrl } from "../../../core/helpers/serializer-utils"
import { presenceRegistry } from "../presence.registry"

export class UserSerializer {

    static async single(user: User) {
        const presence = presenceRegistry.get(user.email)
        return {
            id: user.id,
            employeeId: user.employeeId,
            name: user.name,
            photo: await resolveFileUrl(user.photo),
            email: user.email,
            isActive: Boolean(user.isActive),
            role: user.role,
            availability: presence?.availability ?? "offline",
            currentCallId: presence?.currentCallId ?? null,
        }
    }

    static async collection(users: User[]) {
        return Promise.all(users.map(user => this.single(user)))
    }
}