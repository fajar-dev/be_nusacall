import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { RecordingArtifactStatus } from "../enum/recording-artifact-status.enum"

/**
 * Recording and transcript are independent artifacts (separate webhooks/lifecycles) but always
 * 1:1 with a call, so they share one table. No FK to `calls` — this codebase never uses
 * cross-table FKs, plain id columns only.
 */
@Entity("call_recordings")
export class CallRecording {
    @PrimaryGeneratedColumn()
    id!: number

    @Index({ unique: true })
    @Column({ name: "call_id" })
    callId!: number

    @Index({ unique: true })
    @Column({ length: 128 })
    wacid!: string

    // ── Rekaman ─────────────────────────────────────────────────────
    @Column({ name: "recording_status", type: "enum", enum: RecordingArtifactStatus, default: RecordingArtifactStatus.PENDING })
    recordingStatus!: RecordingArtifactStatus

    /** Meta media asset id — re-fetch a fresh download URL from the Media API with this if the webhook's URL already expired (>5 min). */
    @Column({ name: "recording_media_id", length: 64, nullable: true })
    recordingMediaId?: string | null

    @Column({ name: "recording_sha256", length: 64, nullable: true })
    recordingSha256?: string | null

    @Column({ name: "recording_mime_type", length: 64, nullable: true })
    recordingMimeType?: string | null

    /** MinIO object key, once downloaded and stored. */
    @Column({ name: "recording_s3_key", length: 255, nullable: true })
    recordingS3Key?: string | null

    @Column({ name: "recording_available_at", type: "datetime", nullable: true })
    recordingAvailableAt?: Date | null

    /** recordingAvailableAt + config.recording.metaRetentionDays — Meta deletes the media after this. */
    @Column({ name: "recording_expires_at", type: "datetime", nullable: true })
    recordingExpiresAt?: Date | null

    @Column({ name: "recording_error", type: "text", nullable: true })
    recordingError?: string | null

    // ── Transkrip ───────────────────────────────────────────────────
    @Column({ name: "transcript_status", type: "enum", enum: RecordingArtifactStatus, default: RecordingArtifactStatus.PENDING })
    transcriptStatus!: RecordingArtifactStatus

    @Column({ name: "transcript_media_id", length: 64, nullable: true })
    transcriptMediaId?: string | null

    @Column({ name: "transcript_sha256", length: 64, nullable: true })
    transcriptSha256?: string | null

    @Column({ name: "transcript_mime_type", length: 64, nullable: true })
    transcriptMimeType?: string | null

    @Column({ name: "transcript_s3_key", length: 255, nullable: true })
    transcriptS3Key?: string | null

    @Column({ name: "transcript_available_at", type: "datetime", nullable: true })
    transcriptAvailableAt?: Date | null

    @Column({ name: "transcript_expires_at", type: "datetime", nullable: true })
    transcriptExpiresAt?: Date | null

    @Column({ name: "transcript_error", type: "text", nullable: true })
    transcriptError?: string | null

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
