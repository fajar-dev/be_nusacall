export interface EstablishEarlyResult {
    ok: boolean
    error?: string
}

/**
 * Bridges the webhook layer to the media plane (infrastructure/media) without
 * webhook.service.ts needing to know about RTCPeerConnection/MetaClient
 * directly — keeps WebhookService testable without real WebRTC negotiation
 * or network calls to Meta. See docs/BACKEND-MODULES.md §10.3.
 */
export interface ICallMediaCoordinator {
    /**
     * Builds the media session's Meta-facing leg from the SDP offer in a
     * `connect` webhook, and sends pre_accept. Never throws — failures are
     * reported via the return value so the caller can decide the resulting
     * call state (see docs/MEDIA-PLANE.md §5).
     */
    establishEarly(wacid: string, phoneNumberId: string, offerSdp: string): Promise<EstablishEarlyResult>

    /** Tears down any media session for this call. Safe to call even if none exists. */
    teardown(wacid: string, reason: string): Promise<void>

    /**
     * Fase 3 (BIC) — applies the WhatsApp user's SDP answer, relayed back
     * via a `connect` webhook with direction BUSINESS_INITIATED, to the
     * Meta leg WE offered in CallSignalingService.initiateOutbound(). Never
     * throws — same never-block-a-call contract as establishEarly().
     */
    applyOutboundAnswer(wacid: string, answerSdp: string): Promise<EstablishEarlyResult>

    /** Fase 3 (BIC) — enables RTP forwarding once the status webhook confirms the user actually answered (ACCEPTED). No-op if no session exists. */
    startOutboundForwarding(wacid: string): Promise<void>
}
