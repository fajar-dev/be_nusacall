export interface EstablishEarlyResult {
    ok: boolean
    error?: string
}

/**
 * Bridges the webhook layer to the media plane without webhook.service.ts needing to know about
 * RTCPeerConnection/MetaClient directly — keeps WebhookService testable without real WebRTC
 * negotiation or network calls to Meta.
 */
export interface ICallMediaCoordinator {
    /**
     * Builds the Meta-facing leg from the connect webhook's SDP offer and sends pre_accept.
     * Never throws — failures come back via the return value so the caller can decide the
     * resulting call state.
     */
    establishEarly(wacid: string, phoneNumberId: string, offerSdp: string): Promise<EstablishEarlyResult>

    /** Tears down any media session for this call. Safe to call even if none exists. */
    teardown(wacid: string, reason: string): Promise<void>

    /**
     * Applies the WhatsApp user's SDP answer, relayed back via a `connect` webhook
     * (BUSINESS_INITIATED direction), to the Meta leg we offered in initiateOutbound().
     * Never throws — same contract as establishEarly().
     */
    applyOutboundAnswer(wacid: string, answerSdp: string): Promise<EstablishEarlyResult>

    /** Enables RTP forwarding once the status webhook confirms the user actually answered (ACCEPTED). No-op if no session exists. */
    startOutboundForwarding(wacid: string): Promise<void>
}
