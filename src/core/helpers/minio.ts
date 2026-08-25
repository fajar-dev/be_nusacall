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
    async ensureBucket(bucket: string = BUCKET) {
        const exists = await minioClient.bucketExists(bucket)
        if (!exists) {
            await minioClient.makeBucket(bucket)
            logger.info('MinIO bucket created', { bucket })
        }
    }

    async upload(objectName: string, buffer: Buffer, contentType: string, bucket: string = BUCKET): Promise<string> {
        await this.ensureBucket(bucket)

        await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
            "Content-Type": contentType,
        })

        logger.info('MinIO object uploaded', { bucket, objectName, contentType, size: buffer.length })
        return objectName
    }

    async getPresignedUrl(objectName: string, expiry: number = 7 * 24 * 60 * 60, bucket: string = BUCKET): Promise<string> {
        return minioClient.presignedGetObject(bucket, objectName, expiry)
    }

    getPublicUrl(objectName: string, bucket: string = BUCKET): string {
        const protocol = config.minio.useSSL ? "https" : "http"
        const portPart = (config.minio.useSSL && config.minio.port === 443) || (!config.minio.useSSL && config.minio.port === 80)
            ? ""
            : `:${config.minio.port}`
        return `${protocol}://${config.minio.endPoint}${portPart}/${bucket}/${objectName}`
    }

    getProxyUrl(objectName: string): string {
        return `${config.app.appUrl}/api/proxy?path=${encodeURI(objectName)}`
    }

    async getObject(objectName: string, bucket: string = BUCKET): Promise<{ stream: Readable; stat: Minio.BucketItemStat }> {
        const stat = await minioClient.statObject(bucket, objectName)
        const stream = await minioClient.getObject(bucket, objectName)
        return { stream, stat }
    }

    /** Buffers a whole object into memory — only for small objects (e.g. transcript JSON), never recordings. */
    async download(objectName: string, bucket: string = BUCKET): Promise<Buffer> {
        const { stream } = await this.getObject(objectName, bucket)
        const chunks: Buffer[] = []
        for await (const chunk of stream) chunks.push(chunk as Buffer)
        return Buffer.concat(chunks)
    }

    async delete(objectName: string, bucket: string = BUCKET): Promise<void> {
        await minioClient.removeObject(bucket, objectName)
        logger.info('MinIO object deleted', { bucket, objectName })
    }

    async exists(objectName: string, bucket: string = BUCKET): Promise<boolean> {
        try {
            await minioClient.statObject(bucket, objectName)
            return true
        } catch {
            return false
        }
    }

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

    /** Handles nested/double-encoded URLs when extracting the relative object path. */
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
