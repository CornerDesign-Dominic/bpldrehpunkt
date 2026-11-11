import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DEV_PROJECT = 'db-bpl-drehpunkt-dev'
export const FIREBASE_CLI_VERSION = '15.35.0'
export const TIME_FUNCTIONS = Object.freeze([
  'listTimeWorkspace', 'listOwnTimeBookings', 'saveTimeWorkModel', 'saveTimeAccount', 'stampTime',
  'correctTimeDay', 'getOwnMobileVacation', 'listManagedUsers',
  'createManagedUser', 'updateManagedUser', 'replacePendingVacationRequest',
  'processVacationRequest',
  'listTimeWorkModelTemplates', 'saveTimeWorkModelTemplate', 'archiveTimeWorkModelTemplate',
])
const scopes = ['all', 'backend', 'rules', 'indexes']
const checkout = fileURLToPath(new URL('../', import.meta.url))

export function parseDeployArguments(args) {
  const options = { deploy: false, only: 'all', cliPath: '' }
  const seen = new Set()
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    if (!['--deploy', '--only', '--cli'].includes(flag) || seen.has(flag)) {
      throw new Error(`Unsupported or duplicate argument: ${flag}. The project and deploy targets cannot be overridden.`)
    }
    seen.add(flag)
    if (flag === '--deploy') options.deploy = true
    else {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`)
      if (flag === '--only') options.only = value
      else options.cliPath = value
    }
  }
  if (!scopes.includes(options.only)) throw new Error('--only must be all, backend, rules or indexes.')
  return options
}

export function deploymentPlan(scope = 'all') {
  if (!scopes.includes(scope)) throw new Error('Unsupported deployment scope.')
  const targets = [
    ['indexes', 'firestore:indexes'],
    ['rules', 'firestore:rules'],
    ['backend', TIME_FUNCTIONS.map(name => `functions:${name}`).join(',')],
  ]
  return targets.filter(([kind]) => scope === 'all' || scope === kind).map(([kind, target]) => ({
    kind,
    args: ['deploy', '--project', DEV_PROJECT, '--non-interactive', '--only', target],
  }))
}

export function resolveFirebaseCli(explicitPath = '', environment = process.env) {
  let path = explicitPath || environment.FIREBASE_CLI_PATH
  if (!path) {
    try { path = createRequire(import.meta.url).resolve('firebase-tools/lib/bin/firebase.js') }
    catch { throw new Error('Set FIREBASE_CLI_PATH or pass --cli with the firebase-tools/lib/bin/firebase.js path. No CLI or authentication is installed automatically.') }
  }
  const absolute = resolve(path)
  let metadata
  try { metadata = JSON.parse(readFileSync(resolve(dirname(absolute), '../../package.json'), 'utf8')) }
  catch { throw new Error('The Firebase CLI package could not be verified.') }
  if (metadata.name !== 'firebase-tools' || metadata.version !== FIREBASE_CLI_VERSION || !absolute.replaceAll('\\', '/').endsWith('/lib/bin/firebase.js')) {
    throw new Error(`Use firebase-tools ${FIREBASE_CLI_VERSION} and its lib/bin/firebase.js entry point.`)
  }
  // Verify the entry point exists without executing it.
  readFileSync(absolute)
  return absolute
}

export function runTimeDevDeployment(options, { environment = process.env, run = spawnSync, log = console.log } = {}) {
  const plan = deploymentPlan(options.only)
  log(JSON.stringify({ mode: options.deploy ? 'deploy' : 'dry-run', project: DEV_PROJECT, functions: TIME_FUNCTIONS, steps: plan }, null, 2))
  if (!options.deploy) return plan
  const cli = resolveFirebaseCli(options.cliPath, environment)
  for (const step of plan) {
    const result = run(process.execPath, [cli, ...step.args], { cwd: checkout, env: environment, stdio: 'inherit', shell: false })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Firebase ${step.kind} deployment stopped (exit ${result.status ?? result.signal ?? 'unknown'}). No later step was run.`)
  }
  log('Dev deployment commands finished. Verify index readiness and authenticated app behavior separately before declaring the PWA ready.')
  return plan
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { runTimeDevDeployment(parseDeployArguments(process.argv.slice(2))) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
