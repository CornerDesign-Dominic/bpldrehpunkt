import test from 'node:test'
import assert from 'node:assert/strict'
import { generateReplySuggestion, validateReplySuggestionInput, validateReplySuggestion } from './mailboxReplySuggestions.js'

test('reply suggestion boundaries reject malformed or excessive input and output', () => {
  for (const input of [{ instruction: 'x'.repeat(1001) }, { currentReply: [] }, { previousSuggestion: '\0' }]) assert.throws(() => validateReplySuggestionInput(input), { code: 'invalid-argument' })
  for (const value of ['', null, 'wort '.repeat(301), 'Text\0']) assert.throws(() => validateReplySuggestion(value), { code: 'unavailable' })
  assert.equal(validateReplySuggestion('  Hallo!  '), 'Hallo!')
})

test('AI request isolates source text, bounds context and uses content-free usage accounting', async () => {
  let sent, accounting
  const result = await generateReplySuggestion({ userId: 'user', apiKey: 'fixture-only', mail: { subject: 'Termin', body: { contentType: 'text', content: 'Neueste Nachricht\n' + 'x'.repeat(40000) } }, input: validateReplySuggestionInput({ instruction: 'Locker', currentReply: 'Mein Text', previousSuggestion: 'Alt' }),
    execute: async data => { accounting = data; return data.operation() },
    http: async (url, options) => { assert.equal(url, 'https://api.openai.com/v1/responses'); sent = JSON.parse(options.body); return { ok: true, headers: { get: () => 'request' }, json: async () => ({ status: 'completed', output_text: JSON.stringify({ suggestion: 'Vielen Dank für die Information.' }), usage: { input_tokens: 10, output_tokens: 6 } }) } },
  })
  assert.equal(result, 'Vielen Dank für die Information.')
  assert.equal(accounting.feature, 'mailbox_reply_suggestion')
  assert.equal(accounting.userId, 'user')
  assert.equal(sent.store, false)
  assert.equal(sent.tools, undefined)
  const context = JSON.parse(sent.input[0].content[0].text)
  assert.equal(context.incomingMail.body.length, 32000)
  assert.ok(context.incomingMail.body.startsWith('Neueste Nachricht'))
  assert.equal(context.userInstruction, 'Locker')
  assert.equal(context.currentReply, 'Mein Text')
})

test('incomplete, refused, empty mail and HTML never become reply proposals', async () => {
  const base = { apiKey: 'fixture', input: validateReplySuggestionInput({}), execute: data => data.operation() }
  await assert.rejects(generateReplySuggestion({ ...base, mail: { body: { contentType: 'html', content: '<p>Hallo</p>' } } }), { code: 'failed-precondition' })
  await assert.rejects(generateReplySuggestion({ ...base, mail: {} }), { code: 'failed-precondition' })
  for (const payload of [{ status: 'incomplete', output_text: '{"suggestion":"Abgeschnitten"}' }, { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] }]) {
    await assert.rejects(generateReplySuggestion({ ...base, mail: { body: { content: 'Hallo' } }, http: async () => ({ ok: true, json: async () => payload }) }), { code: 'unavailable' })
  }
})
