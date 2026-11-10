import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import test from 'node:test'
import { assertTimeWebDevEnvironment } from './build-time-web-dev.mjs'

const dev = { VITE_FIREBASE_PROJECT_ID: 'db-bpl-drehpunkt-dev', VITE_FIREBASE_APP_ID: '1:123:web:dev' }
test('Dev web target accepts only the exact dev project and returns no environment secrets', () => {
  assert.deepEqual(assertTimeWebDevEnvironment({ ...dev, VITE_FIREBASE_API_KEY: 'not-exported' }), { projectId: dev.VITE_FIREBASE_PROJECT_ID, appId: dev.VITE_FIREBASE_APP_ID })
  for (const project of ['db-bpl-drehpunkt', '', undefined, ' db-bpl-drehpunkt-dev']) {
    assert.throws(() => assertTimeWebDevEnvironment({ ...dev, VITE_FIREBASE_PROJECT_ID: project }), /PROJECT_ID/)
  }
})
test('process variables cannot override a dev dotenv file with production credentials', () => {
  assert.throws(() => assertTimeWebDevEnvironment(dev, { VITE_FIREBASE_PROJECT_ID: 'db-bpl-drehpunkt' }), /PROJECT_ID/)
  assert.throws(() => assertTimeWebDevEnvironment(dev, { VITE_FIREBASE_APP_ID: '' }), /APP_ID/)
  assert.deepEqual(assertTimeWebDevEnvironment({}, dev), { projectId: dev.VITE_FIREBASE_PROJECT_ID, appId: dev.VITE_FIREBASE_APP_ID })
})
test('the executable rejects overrides before starting a build', () => {
  const result = spawnSync(process.execPath, ['scripts/build-time-web-dev.mjs', '--project', 'db-bpl-drehpunkt'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /keine Projekt- oder Modusüberschreibungen/)
  assert.equal(result.stdout, '')
})
test('separate Hosting configuration names only the new dev site and guards its SPA build', () => {
  const config = JSON.parse(readFileSync(new URL('../firebase.time-dev.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(config), ['hosting'])
  assert.equal(config.hosting.site, 'db-bpl-drehpunkt-dev-web-time')
  assert.deepEqual(config.hosting.predeploy, ['node scripts/build-time-web-dev.mjs'])
  assert.deepEqual(config.hosting.rewrites, [{ source: '**', destination: '/index.html' }])
  assert.ok(config.hosting.headers.some(rule => rule.source === '**' && rule.headers.some(header => header.key === 'Cache-Control' && header.value.includes('no-store'))))
})
