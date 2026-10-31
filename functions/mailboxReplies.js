import { HttpsError } from 'firebase-functions/v2/https'

const messageIds = value => String(value || '').match(/<[^<>\s]+>/g) || []
const header = (mail, name) => (mail.internetMessageHeaders || []).filter(item => item.name?.toLowerCase() === name).map(item => item.value || '').join(' ')

// Match RFC message references, never subject alone or simply the latest message in a conversation.
export function associateMailboxReplies(incoming, sent) {
  const ids = new Map(incoming.filter(mail => mail.internetMessageId).map(mail => [mail.internetMessageId.trim(), mail]))
  const outgoing = new Map(sent.filter(mail => mail.internetMessageId).map(mail => [mail.internetMessageId.trim(), mail]))
  const result = Object.fromEntries(incoming.map(mail => [mail.id, []]))
  const seen = new Set()
  const parentOf = (reply, visited = new Set()) => {
    const direct = messageIds(header(reply, 'in-reply-to'))
    const parentId = direct.length === 1 ? direct[0] : direct.length ? null : messageIds(header(reply, 'references')).at(-1)
    if (!parentId || visited.has(parentId) || visited.size >= 50) return null
    if (ids.has(parentId)) return ids.get(parentId)
    // An unknown reference may be a newer incoming mail that isn't on this page.
    // Never attach it to an older card merely because that card appears in References.
    if (!outgoing.has(parentId)) return null
    visited.add(parentId)
    return parentOf(outgoing.get(parentId), visited)
  }
  for (const reply of sent) {
    if (/multipart\/report/i.test(header(reply, 'content-type')) || reply.isDraft || !reply.id || !Number.isFinite(Date.parse(reply.sentDateTime))) continue
    const parent = parentOf(reply)
    if (!parent || !Number.isFinite(Date.parse(parent.receivedDateTime)) || Date.parse(reply.sentDateTime) < Date.parse(parent.receivedDateTime)) continue
    const key = `${parent.id}|${reply.internetMessageId || reply.id}`
    if (seen.has(key)) continue
    seen.add(key)
    result[parent.id].push({ id: reply.id, sentDateTime: reply.sentDateTime })
  }
  for (const replies of Object.values(result)) replies.sort((a, b) => a.sentDateTime.localeCompare(b.sentDateTime) || a.id.localeCompare(b.id))
  return result
}

export async function listMailboxReplies({ ids, base, graph, validatePage }) {
  if (!Array.isArray(ids) || ids.length > 30 || !ids.length || ids.some(id => typeof id !== 'string' || !id || id.length > 2048 || [...id].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw new HttpsError('invalid-argument', 'Bitte höchstens 30 gültige Nachrichten auswählen.')
  const batch = async paths => {
    const results = []
    for (let start = 0; start < paths.length; start += 20) {
      const chunk = paths.slice(start, start + 20)
      const response = await graph('/$batch', { method: 'POST', body: JSON.stringify({ requests: chunk.map((url, index) => ({ id: String(index), method: 'GET', url, headers: { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' } })) }) })
      results.push(...chunk.map((_, index) => {
        const item = response.responses?.find(item => item.id === String(index))
        if (!item || item.status < 200 || item.status >= 300) throw new HttpsError(item?.status === 403 ? 'permission-denied' : 'unavailable', 'Gesendete Antworten konnten nicht vollständig geladen werden.')
        return item.body
      }))
    }
    return results
  }
  const incoming = await batch([...new Set(ids)].map(id => `${base}/messages/${encodeURIComponent(id)}?$select=id,internetMessageId,conversationId,receivedDateTime`))
  const conversations = [...new Set(incoming.map(mail => mail.conversationId).filter(value => typeof value === 'string' && value.length <= 1024))]
  const paths = conversations.map(id => `${base}/mailFolders/sentitems/messages?${new URLSearchParams({ '$filter': `conversationId eq '${id.replaceAll("'", "''")}'`, '$select': 'id,internetMessageId,sentDateTime,isDraft', '$top': '100' })}`)
  const sent = []
  let pending = paths
  let partial = false
  for (let page = 0; pending.length && page < 5; page++) {
    const pages = await batch(pending)
    pending = []
    for (const list of pages) {
      sent.push(...(list.value || []))
      if (list['@odata.nextLink']) {
        if (validatePage) { pending.push(validatePage(list['@odata.nextLink'])); continue }
        const link = new URL(list['@odata.nextLink'])
        // Only follow Microsoft's nextLink for the same requested mailbox/folder.
        const normalized = decodeURIComponent(link.pathname.slice('/v1.0'.length)).toLowerCase()
        const expected = decodeURIComponent(`${base}/mailFolders/sentitems/messages`).toLowerCase()
        if (link.origin !== 'https://graph.microsoft.com' || link.username || link.password || normalized !== expected || link.hash) throw new HttpsError('unavailable', 'Ungültige Folgeseite für gesendete Antworten.')
        pending.push(link.pathname.slice('/v1.0'.length) + link.search)
      }
    }
    if (sent.length > 200) { partial = true; break }
  }
  if (pending.length) partial = true
  const unique = [...new Map(sent.filter(mail => mail.id).map(mail => [mail.id, mail])).values()]
  const headers = await batch(unique.slice(0, 200).map(mail => `${base}/messages/${encodeURIComponent(mail.id)}?$select=id,internetMessageId,internetMessageHeaders,sentDateTime,isDraft`))
  return { replies: associateMailboxReplies(incoming, headers), partial }
}
