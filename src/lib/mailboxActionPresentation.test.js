import test from 'node:test'
import assert from 'node:assert/strict'
import { mailboxActionDisplayState } from './mailboxActionPresentation.js'

test('only an unhandled automatic recommendation receives the recommendation state', () => {
  assert.equal(mailboxActionDisplayState(undefined, true), 'recommended')
  assert.equal(mailboxActionDisplayState(undefined, false), 'idle')
})

test('manual progress, review, completion and failures take precedence over recommendations', () => {
  for (const state of ['running', 'review', 'completed', 'failed', 'idle']) {
    const action = Object.freeze({ state, jobId: 'existing-job' })
    assert.equal(mailboxActionDisplayState(action, true), state)
    assert.equal(mailboxActionDisplayState(action, false), state)
  }
})

test('discarding leaves a neutral action even when an old recommendation is still present', () => {
  const discarded = Object.freeze({ state: 'discarded', jobId: 'discarded-job' })
  assert.equal(mailboxActionDisplayState(discarded, true), 'idle')
  assert.equal(mailboxActionDisplayState(discarded, false), 'idle')
  assert.equal(discarded.state, 'discarded')
})
