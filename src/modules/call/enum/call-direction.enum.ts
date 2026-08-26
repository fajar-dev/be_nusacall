export enum CallDirection {
    INBOUND = "inbound",
    OUTBOUND = "outbound",
}

export function fromMetaDirection(direction: string): CallDirection {
    return direction === "BUSINESS_INITIATED" ? CallDirection.OUTBOUND : CallDirection.INBOUND
}
