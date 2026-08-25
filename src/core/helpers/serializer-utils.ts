import { minio } from "./minio"

/**
 * Resolve a file path to its accessible URL.
 * - If the value is already a full URL (external source), return as-is.
 * - If it's a MinIO relative path, generate a presigned URL.
 *
 * Used for photos, images, and any file stored in MinIO or referenced externally.
 */
export async function resolveFileUrl(path?: string | null): Promise<string | null> {
    if (!path) return null
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    return await minio.getPresignedUrl(path)
}

/** @deprecated Use resolveFileUrl instead */
export const resolvePhotoUrl = resolveFileUrl