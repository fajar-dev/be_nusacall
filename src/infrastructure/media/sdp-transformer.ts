export function ensurePtime20(sdp: string, ptimeMs = 20): string {
    const lines = sdp.split("\r\n")
    const hasPtime = lines.some((l) => l.startsWith("a=ptime:"))
    const hasMaxptime = lines.some((l) => l.startsWith("a=maxptime:"))

    if (hasPtime && hasMaxptime) return sdp

    const mLineIndex = lines.findIndex((l) => l.startsWith("m=audio"))
    if (mLineIndex === -1) return sdp

    const toInsert: string[] = []
    if (!hasPtime) toInsert.push(`a=ptime:${ptimeMs}`)
    if (!hasMaxptime) toInsert.push(`a=maxptime:${ptimeMs}`)

    let insertAt = mLineIndex + 1
    while (insertAt < lines.length && lines[insertAt]!.startsWith("c=")) insertAt++

    lines.splice(insertAt, 0, ...toInsert)
    return lines.join("\r\n")
}
