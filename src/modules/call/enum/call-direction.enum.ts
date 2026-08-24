export enum CallDirection {
    INBOUND = "inbound",   // Meta: USER_INITIATED
    OUTBOUND = "outbound", // Meta: BUSINESS_INITIATED
}

export function fromMetaDirection(direction: string): CallDirection {
    return direction === "BUSINESS_INITIATED" ? CallDirection.OUTBOUND : CallDirection.INBOUND
}
