// Cleans only local learning copies. Never use this helper for the actual outgoing mail.
const MAX_COPY_LENGTH = 100000
const decodeEntities = value => value.replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39|#\d{1,7}|#x[\da-f]{1,6});/giu, entity => {
  const named = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" }
  if (named[entity.toLowerCase()] !== undefined) return named[entity.toLowerCase()]
  const number = entity[2]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10)
  return Number.isInteger(number) && number >= 32 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : ''
})
const header = /^\s*(?:From|Von|To|An|Cc|Bcc|Sent|Gesendet|Date|Datum|Subject|Betreff|Reply-To|Antwort an)\s*:/iu
const quotedBoundary = /^\s*(?:[-_ ]{3,}(?:(?:Original|Forwarded) (?:Message|message)|Ursprüngliche Nachricht|Weitergeleitete Nachricht)[-_ :]*|Begin forwarded message:|On .{3,400} wrote:|Am .{3,400} schrieb(?:en)? .{0,200}:)\s*$/iu
const signature = /^\s*(?:--\s*|(?:Mit freundlichen Grüßen|Freundliche Grüße|Beste Grüße|Viele Grüße|Liebe Grüße|Best regards|Kind regards|Regards|Sincerely|MfG)[,!.]?|(?:Gesendet von meinem|Sent from my) .{1,120})\s*$/iu

export function cleanKnowledgeMailCopy(value) {
  if (typeof value !== 'string') return ''
  const plain = decodeEntities(value.slice(0, MAX_COPY_LENGTH)
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>/giu, '')
    .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote\s*>/giu, '')
    .replace(/<img\b[^>]*>/giu, '')
    .replace(/<(?:br|hr)\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6])\s*>/giu, '\n')
    .replace(/<\/?(?:html|head|body|p|div|span|a|strong|b|em|i|u|table|tbody|thead|tr|td|th|ul|ol|li|blockquote|h[1-6]|font|section)\b[^>]*>/giu, '')
    .replace(/\r\n?/gu, '\n'))
  let lines = Array.from(plain).filter(character => character === '\n' || character === '\t' || (character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)).join('').split('\n')
  const first = lines.findIndex(line => line.trim())
  if (first >= 0 && header.test(lines[first])) {
    let end = first
    while (end < lines.length && header.test(lines[end])) end++
    if (end - first >= 2) lines = lines.slice(end)
  }
  const result = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trimEnd()
    if (quotedBoundary.test(line)) break
    let headerEnd = index
    while (headerEnd < lines.length && header.test(lines[headerEnd])) headerEnd++
    if (headerEnd - index >= 2 && result.some(item => item.trim())) break
    if (signature.test(line) && result.some(item => item.trim())) break
    if (/^\s*>/u.test(line)) continue
    if (/^\s*(?:\[(?:(?:cid|image|bild|attachment|anlage|anhang)[:\s][^\]]*|(?:image|bild|attachment|anlage|anhang))\]|cid:[^\s]+|data:image\/[^\s]+)\s*$/iu.test(line)) continue
    result.push(line)
  }
  return result.join('\n').replace(/\n[ \t]+\n/gu, '\n\n').replace(/\n{3,}/gu, '\n\n').trim()
}
