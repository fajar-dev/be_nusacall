export enum EndReason {
    CUSTOMER_HANGUP = "customer_hangup",
    AGENT_HANGUP = "agent_hangup",
    AGENT_REJECTED = "agent_rejected",
    NO_AGENT_AVAILABLE = "no_agent_available",
    ANSWER_TIMEOUT = "answer_timeout",
    MEDIA_FAILURE = "media_failure",
    META_ERROR = "meta_error",
    OUTSIDE_CALL_HOURS = "outside_call_hours",
    NOT_WHITELISTED = "not_whitelisted",
    RECONCILED_TIMEOUT = "reconciled_timeout",
}
