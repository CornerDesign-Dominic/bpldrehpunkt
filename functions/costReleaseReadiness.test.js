import test from 'node:test'
import assert from 'node:assert/strict'
import { costReadinessPaths, parseReadinessArguments, summarizeCostReadiness } from './costReleaseReadiness.js'

test('readiness requires every current generation and complete pallet tour coverage', () => {
  assert.equal(costReadinessPaths.list, 'backgroundWorkState/transport-order-list-v3')
  const states = { tracking: { complete: true }, reminders: { complete: true }, list: { complete: true }, pallets: { version: 1, status: 'ready', generation: 'g', tourCoverage: true } }
  assert.equal(summarizeCostReadiness(states).dataReady, true)
  for (const key of ['tracking', 'reminders', 'list']) {
    assert.equal(summarizeCostReadiness({ ...states, [key]: { complete: false } }).backgroundReady, false)
    assert.equal(summarizeCostReadiness({ ...states, [key]: { complete: 'true' } }).backgroundReady, false)
  }
  for (const patch of [{ status: 'building' }, { status: 'dirty' }, { version: 2 }, { generation: '' }, { tourCoverage: false }]) {
    assert.equal(summarizeCostReadiness({ ...states, pallets: { ...states.pallets, ...patch } }).dataReady, false)
  }
  assert.equal(summarizeCostReadiness({}).dataReady, false)
  assert.deepEqual(Object.keys(summarizeCostReadiness(states)), ['tracking', 'reminders', 'list', 'pallets', 'backgroundReady', 'dataReady'])
})

test('read-only CLI rejects production, implicit targets and mixed emulator/Dev targets', () => {
  assert.deepEqual(parseReadinessArguments(['--project', 'db-bpl-drehpunkt-dev', '--require', 'all']), { project: 'db-bpl-drehpunkt-dev', requirement: 'all', emulator: false })
  assert.equal(parseReadinessArguments(['--project', 'demo-cost-release', '--require', 'background'], '127.0.0.1:8087').emulator, true)
  for (const args of [[], ['--project', 'db-bpl-drehpunkt', '--require', 'all'], ['--project', 'demo-cost', '--require', 'all'], ['--project', 'db-bpl-drehpunkt-dev', '--require', 'any'], ['--project', 'db-bpl-drehpunkt-dev', '--require', 'all', '--apply']]) {
    assert.throws(() => parseReadinessArguments(args))
  }
  assert.throws(() => parseReadinessArguments(['--project', 'db-bpl-drehpunkt-dev', '--require', 'all'], '127.0.0.1:8087'))
  assert.throws(() => parseReadinessArguments(['--project', 'demo-cost', '--require', 'all'], 'remote:8087'))
})
