import { User } from "../entities/user.entity"
import { minio } from "../../../core/helpers/minio"

export class UserSerializer {
    private static async resolvePhotoUrl(photo?: string | null): Promise<string | null> {
        if (!photo) return null
        return await minio.getPresignedUrl(photo)
    }

    static async single(user: User) {
        return {
            id: user.id,
            name: user.name,
            photo: await this.resolvePhotoUrl(user.photo),
            email: user.email,
            isActive: Boolean(user.isActive),
            createdAt: user.createdAt
        }
    }

    static async collection(users: User[]) {
        return Promise.all(users.map(user => this.single(user)))
    }
}
