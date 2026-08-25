import { minio } from "./minio"

export async function resolveFileUrl(path?: string | null): Promise<string | null> {
    if (!path) return null
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    return await minio.getPresignedUrl(path)
}

/** @deprecated Use resolveFileUrl instead */
export const resolvePhotoUrl = resolveFileUrl