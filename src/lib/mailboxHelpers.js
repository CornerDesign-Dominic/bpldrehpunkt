export function recipientAddress(recipient) {
  return recipient?.emailAddress?.address || ''
}

export function recipientText(recipients = []) {
  return recipients.map(recipientAddress).filter(Boolean).join('; ')
}

export function parseRecipients(value) {
  const addresses = value.split(/[;,\n]/).map((part) => part.trim()).filter(Boolean)
  if (addresses.some((address) => !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address))) {
    throw new Error('invalid-recipients')
  }
  return [...new Map(addresses.map((address) => [address.toLowerCase(), { emailAddress: { address } }])).values()]
}

export function replyRecipients(message, ownAddress, replyAll = false) {
  const targets = message.replyTo?.length ? message.replyTo : [message.from].filter(Boolean)
  const seen = new Set([ownAddress?.toLowerCase()])
  function unique(recipients) {
    return recipients.filter((recipient) => {
      const key = recipientAddress(recipient).toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return {
    to: recipientText(unique([...targets, ...(replyAll ? message.toRecipients || [] : [])])),
    cc: recipientText(unique(replyAll ? message.ccRecipients || [] : [])),
    bcc: '',
  }
}

export function safeAttachmentName(name) {
  return Array.from(name || 'attachment', (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '/' || char === '\\' ? '_' : char).join('').slice(0, 180)
}

export function attachmentBlob(data) {
  const binary = atob(data.contentBase64)
  return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type: data.contentType || 'application/octet-stream' })
}

export function safeOutlookLink(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['outlook.office.com', 'outlook.office365.com', 'outlook.live.com'].includes(url.hostname) ? url.href : null
  } catch { return null }
}

export async function createConnectionProof() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const encode = (value) => btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  const proof = encode(bytes)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof))
  return { proof, proofChallenge: encode(new Uint8Array(digest)) }
}
