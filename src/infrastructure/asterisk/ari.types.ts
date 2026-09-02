export interface AriCaller {
    number: string
    name: string
}

export interface AriChannel {
    id: string
    state: string
    caller: AriCaller
}

export interface AriBridge {
    id: string
}

export interface AriRecording {
    name: string
    format: string
    duration?: number
    target_uri: string
}

export interface AriStasisStartEvent {
    type: "StasisStart"
    application: string
    args: string[]
    channel: AriChannel
}

export interface AriStasisEndEvent {
    type: "StasisEnd"
    application: string
    channel: AriChannel
}

export interface AriChannelStateChangeEvent {
    type: "ChannelStateChange"
    channel: AriChannel
}

export interface AriRecordingFinishedEvent {
    type: "RecordingFinished"
    recording: AriRecording
}

export type AriEvent = { type: string; [key: string]: unknown }

export interface AriOriginateChannelParams {
    endpoint: string
    app: string
    appArgs?: string
    callerId?: string
    timeoutSeconds?: number
}

export type StasisStartListener = (event: AriStasisStartEvent) => void
export type StasisEndListener = (event: AriStasisEndEvent) => void
export type ChannelStateChangeListener = (event: AriChannelStateChangeEvent) => void
export type RecordingFinishedListener = (event: AriRecordingFinishedEvent) => void
