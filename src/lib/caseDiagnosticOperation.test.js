import test from 'node:test'
import assert from 'node:assert/strict'
import { createCaseDiagnosticReporter } from './caseDiagnosticOperation.js'
import { caseDiagnosticCode, diagnosticCode } from './diagnosticClassification.js'

test('case failures classify access and storage codes without changing generic workflows', () => {
  for (const code of ['permission-denied', 'firestore/permission-denied', 'functions/permission-denied', 'functions/unauthenticated', 'storage/unauthorized', 'storage/unauthenticated']) {
    assert.equal(caseDiagnosticCode({ code }), 'access-failure')
  }
  assert.equal(diagnosticCode({ code: 'permission-denied' }), null)
  for (const code of ['invalid-argument', 'functions/failed-validation', 'storage/canceled', 'functions/aborted']) assert.equal(caseDiagnosticCode({ code }), null)
  assert.equal(caseDiagnosticCode(new Error('secret validation text')), null)
  assert.equal(caseDiagnosticCode({ code: 'storage/retry-limit-exceeded' }), 'deadline-exceeded')
  assert.equal(caseDiagnosticCode({ code: 'storage/quota-exceeded' }), 'resource-exhausted')
  assert.equal(caseDiagnosticCode({ code: 'storage/object-not-found' }), 'unavailable')
  assert.equal(caseDiagnosticCode({ code: 'failed-precondition' }), 'storage-failure')
  assert.equal(caseDiagnosticCode({ code: 'storage/unknown' }), 'unknown')
})

test('case operation keeps results/errors and reports only fixed technical metadata', async () => {
  const calls = []
  const reporter = createCaseDiagnosticReporter((payload) => calls.push(payload))
  const cause = Object.assign(new Error('Private case contents and storage path'), { code: 'storage/unauthorized', details: { filename: 'secret.pdf' } })
  const action = reporter.operation('damages', 'upload', async (value) => { assert.equal(value.private, 'case contents'); throw cause })
  await assert.rejects(action({ private: 'case contents' }), (error) => error === cause)
  assert.deepEqual(calls, [{ module: 'damages', stage: 'upload', code: 'access-failure' }])
  assert.equal(await reporter.operation('inkasso', 'save', async () => 'saved')(), 'saved')
  await assert.rejects(reporter.operation('inkasso', 'save', async () => { throw new Error('Invalid invoice amount') })())
  assert.equal(calls.length, 1)
})

test('diagnostic delivery failures never replace the original case failure', async () => {
  const cause = Object.assign(new Error('Original'), { code: 'permission-denied' })
  for (const report of [() => { throw new Error('sync reporting failure') }, async () => { throw new Error('async reporting failure') }]) {
    const reporter = createCaseDiagnosticReporter(report)
    await assert.rejects(reporter.operation('insolvencies', 'save', async () => { throw cause })(), (error) => error === cause)
  }
})
