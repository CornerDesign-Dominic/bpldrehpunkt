import assert from 'node:assert/strict'
import test from 'node:test'
import { createConnectionProof, documentAttachmentBlob, mailboxLabel, mailboxUrl, parseRecipients, replyRecipients, safeAttachmentName, safeOutlookLink } from './mailboxHelpers.js'

test('document preview recognizes real signatures despite generic MIME and rejects disguised HTML',async()=>{
  for(const [bytes,type] of [['%PDF-1.7\ninvoice','application/pdf'],['\x89PNG\r\n\x1a\nimage','image/png'],['\xff\xd8\xffimage','image/jpeg'],['GIF89aimage','image/gif'],['RIFF1234WEBPimage','image/webp']]) {
    const blob=documentAttachmentBlob({contentBase64:btoa(bytes),contentType:'application/octet-stream',name:'document.pdf'})
    assert.equal(blob.type,type);assert.equal(blob.size,bytes.length)
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),Uint8Array.from(bytes,c=>c.charCodeAt(0)))
  }
  assert.throws(()=>documentAttachmentBlob({contentBase64:btoa('<html>not a PDF</html>'),contentType:'application/pdf',name:'invoice.pdf'}),/unsupported-document/)
})

test('navigation uses the personal mailbox name or email, never the Microsoft display name', () => {
  const mailbox = { email: 'test@example.com', displayName: 'Microsoft Account Name' }
  assert.equal(mailboxLabel(mailbox), 'test@example.com')
  assert.equal(mailboxLabel({ ...mailbox, customName: '  Rechnungen  ' }), 'Rechnungen')
  assert.equal(mailboxLabel({ ...mailbox, customName: '   ' }), 'test@example.com')
  const url = new URL(mailboxUrl('mailbox+with&characters'), 'https://example.test')
  assert.equal(url.searchParams.get('mailbox'), 'mailbox+with&characters')
  assert.equal(url.searchParams.has('message'), false)
})

const recipient = (address) => ({ emailAddress: { address } })

test('reply all prefers Reply-To, excludes own address and deduplicates across To and CC', () => {
  const message = {
    from: recipient('sender@example.com'), replyTo: [recipient('reply@example.com')],
    toRecipients: [recipient('ME@example.com'), recipient('Reply@example.com'), recipient('other@example.com')],
    ccRecipients: [recipient('OTHER@example.com'), recipient('cc@example.com')],
  }
  assert.deepEqual(replyRecipients(message, 'me@example.com', true), { to: 'reply@example.com; other@example.com', cc: 'cc@example.com', bcc: '' })
  assert.deepEqual(replyRecipients(message, 'me@example.com'), { to: 'reply@example.com', cc: '', bcc: '' })
})

test('explicit recipients accept separators, deduplicate and reject header injection or display syntax', () => {
  assert.deepEqual(parseRecipients('A@example.com; a@example.com, b@example.com'), [recipient('a@example.com'), recipient('b@example.com')])
  assert.throws(() => parseRecipients('a@example.com\r\nBcc: hidden@example.com'))
  assert.throws(() => parseRecipients('Name <name@example.com>'))
  assert.deepEqual(parseRecipients(''), [])
})

test('attachment download names discard path separators and control characters', () => {
  assert.equal(safeAttachmentName('../test\\invoice\u0000.pdf'), '.._test_invoice_.pdf')
  assert.equal(safeAttachmentName('x'.repeat(200)).length, 180)
})

test('Outlook links permit only HTTPS on expected exact Microsoft hosts', () => {
  assert.equal(safeOutlookLink('https://outlook.office.com/mail/id/123'), 'https://outlook.office.com/mail/id/123')
  for (const value of ['javascript:alert(1)', 'https://outlook.office.com.attacker.test/mail', 'https://attacker.test', 'http://outlook.office.com']) assert.equal(safeOutlookLink(value), null)
})

test('OAuth proof is random and challenge is SHA256 of the encoded secret', async () => {
  const first = await createConnectionProof()
  const second = await createConnectionProof()
  assert.match(first.proof, /^[a-zA-Z0-9_-]{43}$/)
  assert.match(first.proofChallenge, /^[a-zA-Z0-9_-]{43}$/)
  assert.notEqual(first.proof, second.proof)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(first.proof))
  const expected = btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  assert.equal(first.proofChallenge, expected)
})
