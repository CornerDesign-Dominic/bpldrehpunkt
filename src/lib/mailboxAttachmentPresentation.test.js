import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentViewType, groupMailboxAttachments } from './mailboxAttachmentPresentation.js'

test('only passive browser-viewable MIME types can navigate to app-origin blob URLs', () => {
  for (const type of ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']) assert.equal(attachmentViewType(type), type)
  assert.equal(attachmentViewType('APPLICATION/PDF; charset=binary'), 'application/pdf')
  for (const type of ['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/javascript', 'application/javascript', 'application/xml', 'application/octet-stream', '', null, 'application/pdf-attacker']) assert.equal(attachmentViewType(type), null)
})

test('only explicitly embedded images move below the mail; actual file attachments keep their order', () => {
  const pdf = { id: 'invoice', name: 'Rechnung.pdf', contentType: 'application/pdf', isInline: false }
  const signature = { id: 'signature', name: 'image001.png', contentType: 'image/png', isInline: true }
  const actualPhoto = { id: 'photo', name: 'Ablieferbeleg.jpg', contentType: 'image/jpeg', isInline: false }
  const ambiguousName = { id: 'ambiguous', name: 'Signatur.jpg', contentType: 'image/jpeg' }
  const inlinePdf = { id: 'inline-pdf', contentType: 'application/pdf', isInline: true }
  const attachments = [pdf, signature, actualPhoto, ambiguousName, inlinePdf]
  const groups = groupMailboxAttachments(attachments)
  assert.deepEqual(groups.files, [pdf, actualPhoto, ambiguousName, inlinePdf])
  assert.deepEqual(groups.inlineImages, [signature])
  assert.equal(attachments.length, 5)
  assert.deepEqual(groupMailboxAttachments(), { files: [], inlineImages: [] })
})
