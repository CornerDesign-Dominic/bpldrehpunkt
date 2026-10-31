import assert from 'node:assert/strict'
import test from 'node:test'
import { executeAiOperation } from './aiUsage.js'

test('usage failure preserves a successful provider result without rerunning or recording a failed AI operation', async () => {
  const result = { data: { synthetic: true }, usage: { input_tokens: 10 } }
  let calls = 0
  const entries = [], reports = []
  const actual = await executeAiOperation({ feature: 'test', userId: 'user', model: 'test', operation: async () => { calls++; return result } }, {
    writeUsage: async (entry) => { entries.push(entry); throw new Error('synthetic-db-failure') },
    reportUsageError: async (error, entry) => { reports.push({ error, entry }) },
  })
  assert.equal(actual, result)
  assert.equal(calls, 1)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].success, true)
  assert.equal(entries[0].usage, result.usage)
  assert.equal(reports.length, 1)
})

test('original provider failure survives both usage and diagnostic failures', async () => {
  const failure = Object.assign(new Error('synthetic-provider-failure'), { status: 503, usage: { input_tokens: 20 }, requestId: 'synthetic-request' })
  const entries = []
  await assert.rejects(executeAiOperation({ feature: 'test', userId: 'user', model: 'test', operation: async () => { throw failure } }, {
    writeUsage: async (entry) => { entries.push(entry); throw new Error('synthetic-db-failure') },
    reportUsageError: async () => { throw new Error('synthetic-diagnostic-failure') },
  }), (error) => error === failure)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].success, false)
  assert.equal(entries[0].errorType, 'provider_server_error')
  assert.equal(entries[0].requestId, 'synthetic-request')
})

test('successful usage logging keeps the existing metadata contract', async () => {
  const result = { usage: { input_tokens: 3, output_tokens: 5 }, requestId: 'request', pageCount: 2, fileSize: 42 }
  let entry
  assert.equal(await executeAiOperation({ feature: 'test', userId: 'user', model: 'model', operation: async () => result }, { writeUsage: async (value) => { entry = value } }), result)
  assert.equal(entry.success, true)
  assert.equal(entry.pageCount, 2)
  assert.equal(entry.fileSize, 42)
  assert.equal(entry.requestId, 'request')
})
