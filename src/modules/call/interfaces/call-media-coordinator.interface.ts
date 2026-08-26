export interface EstablishEarlyResult {
    ok: boolean
    error?: string
}

export interface ICallMediaCoordinator {
    establishEarly(wacid: string, phoneNumberId: string, offerSdp: string): Promise<EstablishEarlyResult>
    teardown(wacid: string, reason: string): Promise<void>
    applyOutboundAnswer(wacid: string, answerSdp: string): Promise<EstablishEarlyResult>
    startOutboundForwarding(wacid: string): Promise<void>
}
