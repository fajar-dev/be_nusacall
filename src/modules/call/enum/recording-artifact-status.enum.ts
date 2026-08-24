/** Independent lifecycle per artifact (recording, transcript) on a CallRecording row. */
export enum RecordingArtifactStatus {
    /** *_available webhook received; not yet fetched from Meta. */
    PENDING = "pending",
    /** Downloaded, SHA-256 verified, and stored in MinIO. */
    STORED = "stored",
    /** Download or checksum verification failed — see the *Error column. */
    FAILED = "failed",
    /** Meta's 7-day retention window passed before we downloaded it — gone for good. */
    EXPIRED = "expired",
}
