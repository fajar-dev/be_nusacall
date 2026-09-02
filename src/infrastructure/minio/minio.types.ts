import type * as Minio from "minio"
import type { Readable } from "node:stream"

export interface MinioObjectResult {
    stream: Readable
    stat: Minio.BucketItemStat
}

export interface MinioUploadOptions {
    contentType?: string
    bucket?: string
}
