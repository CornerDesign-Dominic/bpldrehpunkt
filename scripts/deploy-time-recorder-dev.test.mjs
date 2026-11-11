import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { DEV_PROJECT, TIME_FUNCTIONS, deploymentPlan, parseDeployArguments, runTimeDevDeployment } from './deploy-time-recorder-dev.mjs'

test('default invocation is a dry run and cannot execute the Firebase CLI', () => {
  let executed = false
  const lines = []
  const result = runTimeDevDeployment(parseDeployArguments([]), {
    environment: {}, log: value => lines.push(value), run: () => { executed = true; throw new Error('must not run') },
  })
  assert.equal(executed, false)
  assert.equal(result.length, 3)
  assert.equal(JSON.parse(lines[0]).mode, 'dry-run')
  assert.equal(JSON.parse(lines[0]).project, 'db-bpl-drehpunkt-dev')
})

test('every scope fixes the dev project and never includes deletion, storage, hosting or blanket functions', () => {
  assert.equal(TIME_FUNCTIONS.length, 15)
  assert.equal(new Set(TIME_FUNCTIONS).size, 15)
  for (const scope of ['all', 'backend', 'rules', 'indexes']) {
    for (const { args } of deploymentPlan(scope)) {
      assert.equal(args[args.indexOf('--project') + 1], DEV_PROJECT)
      assert.ok(args.includes('--non-interactive'))
      assert.ok(!args.includes('--force'))
      const target = args[args.indexOf('--only') + 1]
      assert.ok(!target.includes('storage') && !target.includes('hosting'))
      if (target.startsWith('functions:')) {
        assert.deepEqual(target.split(',').map(value => value.slice('functions:'.length)), TIME_FUNCTIONS)
        assert.ok(target.split(',').every(value => /^functions:[A-Za-z]+$/.test(value)))
      } else assert.ok(['firestore:rules', 'firestore:indexes'].includes(target))
    }
  }
})

test('production overrides and additional CLI flags are rejected before any remote execution', () => {
  for (const args of [
    ['--project', 'db-bpl-drehpunkt'], ['--project=db-bpl-drehpunkt'],
    ['--force'], ['--only', 'functions'], ['--only', 'hosting'],
    ['--deploy', '--deploy'], ['--cli'], ['--only', '--deploy'],
  ]) assert.throws(() => parseDeployArguments(args))
  const child = spawnSync(process.execPath, ['scripts/deploy-time-recorder-dev.mjs', '--deploy', '--project', 'db-bpl-drehpunkt'], { cwd: resolve('.'), encoding: 'utf8' })
  assert.equal(child.status, 1)
  assert.match(child.stderr, /cannot be overridden/)
  assert.equal(child.stdout, '')
})

test('deploy without a verified CLI cannot invoke a runner', () => {
  assert.throws(() => runTimeDevDeployment({ deploy: true, only: 'backend', cliPath: 'missing-cli/lib/bin/firebase.js' }, {
    environment: {}, log: () => {}, run: () => assert.fail('Unverified CLI must never run'),
  }), /could not be verified/)
})
