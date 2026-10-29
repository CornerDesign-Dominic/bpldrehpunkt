const viewableTypes = new Set(['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'])
const mime = value => typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : ''

// Blob URLs use the application's origin. Never navigate to active HTML/SVG
// supplied by a mail sender; unsupported formats go through a forced download.
export function attachmentViewType(contentType) {
  const type = mime(contentType)
  return viewableTypes.has(type) ? type : null
}

export function groupMailboxAttachments(attachments = []) {
  const inlineImage = item => item.isInline === true && mime(item.contentType).startsWith('image/')
  return { files: attachments.filter(item => !inlineImage(item)), inlineImages: attachments.filter(inlineImage) }
}

const openedAttachments = new Map()
let cleanupTimer = null
export function retainAttachmentTab(url, tab) {
  openedAttachments.set(url, tab)
  if (cleanupTimer !== null) return
  cleanupTimer = window.setInterval(() => {
    for (const [objectUrl, opened] of openedAttachments) {
      let closed = false
      try { closed = opened.closed } catch { /* Some viewers isolate their window context. */ }
      if (closed) { URL.revokeObjectURL(objectUrl); openedAttachments.delete(objectUrl) }
    }
    if (!openedAttachments.size) { window.clearInterval(cleanupTimer); cleanupTimer = null }
  }, 30000)
}
