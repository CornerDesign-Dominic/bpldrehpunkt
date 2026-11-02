// Visual boundaries only: keep every character of the original plain text.
// Unknown formats remain one block rather than guessing from isolated labels.
export function splitMailConversation(text) {
  if (!text) return ['']
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [text]
  const clean = line => line.replace(/^[\s>]+/, '').trim()
  const starts = new Set([0])
  for (let index = 0; index < lines.length; index++) {
    const line = clean(lines[index])
    const replyMarker = /^(?:On .{3,400} wrote:|Am .{3,400} schrieb(?:en)? .{1,200}:)$/i.test(line)
    let outlookHeader = false
    if (/^(?:Von|From):\s*\S/i.test(line)) {
      const fields = []
      for (let next = index + 1; next < Math.min(index + 13, lines.length); next++) {
        const candidate = clean(lines[next])
        if (/^(?:Gesendet|Sent|Datum|Date|An|To|Cc|Bcc|Betreff|Subject):/i.test(candidate)) fields.push(candidate)
        else if (candidate && !/^\s|^>/.test(lines[next])) break
      }
      outlookHeader = fields.some(field => /^(?:Gesendet|Sent|Datum|Date):/i.test(field)) && fields.some(field => /^(?:An|To):/i.test(field)) && fields.some(field => /^(?:Betreff|Subject):/i.test(field))
    }
    if (!replyMarker && !outlookHeader) continue
    let start = index
    if (outlookHeader) {
      let previous = index - 1
      while (previous >= 0 && !clean(lines[previous])) previous--
      if (previous >= 0 && /^(?:[_-]{5,}|[-_ ]*(?:Original Message|Ursprüngliche Nachricht|Weitergeleitete Nachricht|Forwarded message)[-_ :]*$)/i.test(clean(lines[previous]))) start = previous
    }
    starts.add(start)
  }
  const boundaries = [...starts].sort((a, b) => a - b)
  return boundaries.map((start, index) => lines.slice(start, boundaries[index + 1] ?? lines.length).join(''))
}
