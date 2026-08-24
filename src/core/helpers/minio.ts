import * as Minio from "minio"
import { config } from "../../config/config"
import { Readable } from "node:stream"
import { logger } from "./logger"

const minioClient = new Minio.Client({
    endPoint: config.minio.endPoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
})

const BUCKET = config.minio.bucket

class MinioHelper {
    /**
     * Ensure the default bucket exists, create it if not
     */
    async ensureBucket(bucket: string = BUCKET) {
        const exists = await minioClient.bucketExists(bucket)
        if (!exists) {
            await minioClient.makeBucket(bucket)
            logger.info('MinIO bucket created', { bucket })
        }
    }

    /** Uploads a file buffer to MinIO; returns the object name. */
    async upload(objectName: string, buffer: Buffer, contentType: string, bucket: string = BUCKET): Promise<string> {
        await this.ensureBucket(bucket)

        await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
            "Content-Type": contentType,
        })

        logger.info('MinIO object uploaded', { bucket, objectName, contentType, size: buffer.length })
        return objectName
    }

    /**
     * Get a presigned URL for downloading/viewing an object
     * @param objectName - The object key in the bucket
     * @param expiry - Expiry in seconds (default: 7 days)
     * @param bucket - Optional bucket override
     */
    async getPresignedUrl(objectName: string, expiry: number = 7 * 24 * 60 * 60, bucket: string = BUCKET): Promise<string> {
        return minioClient.presignedGetObject(bucket, objectName, expiry)
    }

    /**
     * Get a public URL (for publicly accessible buckets)
     * @param objectName - The object key in the bucket
     * @param bucket - Optional bucket override
     */
    getPublicUrl(objectName: string, bucket: string = BUCKET): string {
        const protocol = config.minio.useSSL ? "https" : "http"
        const portPart = (config.minio.useSSL && config.minio.port === 443) || (!config.minio.useSSL && config.minio.port === 80)
            ? ""
            : `:${config.minio.port}`
        return `${protocol}://${config.minio.endPoint}${portPart}/${bucket}/${objectName}`
    }

    /**
     * Get a proxy URL that goes through the backend
     * @param objectName - The object key in the bucket
     */
    getProxyUrl(objectName: string): string {
        return `${config.app.appUrl}/api/proxy?path=${encodeURI(objectName)}`
    }

    /**
     * Get an object as a readable stream with its metadata
     * @param objectName - The object key in the bucket
     * @param bucket - Optional bucket override
     */
    async getObject(objectName: string, bucket: string = BUCKET): Promise<{ stream: Readable; stat: Minio.BucketItemStat }> {
        const stat = await minioClient.statObject(bucket, objectName)
        const stream = await minioClient.getObject(bucket, objectName)
        return { stream, stat }
    }

    /**
     * Delete an object from MinIO
     * @param objectName - The object key in the bucket
     * @param bucket - Optional bucket override
     */
    async delete(objectName: string, bucket: string = BUCKET): Promise<void> {
        await minioClient.removeObject(bucket, objectName)
        logger.info('MinIO object deleted', { bucket, objectName })
    }

    /**
     * Check if an object exists in the bucket
     * @param objectName - The object key in the bucket
     * @param bucket - Optional bucket override
     */
    async exists(objectName: string, bucket: string = BUCKET): Promise<boolean> {
        try {
            await minioClient.statObject(bucket, objectName)
            return true
        } catch {
            return false
        }
    }

    /**
     * Proxy handler: streams a MinIO object as an HTTP Response
     * @param objectName - The object key in the bucket
     */
    async proxyHandler(objectName: string): Promise<Response> {
        const { stream, stat } = await this.getObject(objectName)
        const contentType = stat.metaData?.["content-type"] || "application/octet-stream"

        const webStream = new ReadableStream({
            start(controller) {
                stream.on("data", (chunk: Buffer) => controller.enqueue(chunk))
                stream.on("end", () => controller.close())
                stream.on("error", (err: Error) => controller.error(err))
            },
        })

        return new Response(webStream, {
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(stat.size),
                "Cache-Control": "public, max-age=86400",
            },
        })
    }

    /**
     * Extracts the relative path of an object from a full URL, or returns it as-is if already relative.
     * Robust against nested, double-encoded URLs.
     */
    sanitizePath(urlOrPath: string | null | undefined, bucket: string = BUCKET): string | null {
        if (!urlOrPath) return null
        
        let decoded = urlOrPath
        try {
            while (decoded && decoded.includes('%')) {
                const next = decodeURIComponent(decoded)
                if (next === decoded) break
                decoded = next
            }
        } catch {
            // malformed encoding — fall through with whatever we decoded so far
        }

        const marker = `/${bucket}/`
        if (decoded.includes(marker)) {
            const parts = decoded.split(marker)
            decoded = parts[parts.length - 1]
        }

        if (decoded.includes('?')) {
            decoded = decoded.split('?')[0]
        }

        decoded = decoded.replace(/^\/+|\/+$/g, '')

        return decoded || null
    }
}

export const minio = new MinioHelper()
export default minio
