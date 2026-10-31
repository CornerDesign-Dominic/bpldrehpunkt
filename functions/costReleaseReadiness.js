import { pathToFileURL } from 'node:url'
import process from 'node:process'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

export const costReadinessPaths = {
  tracking: 'backgroundWorkState/shipment-tracking-v1',
  reminders: 'backgroundWorkState/deadline-reminders-v1',
  list: 'backgroundWorkState/transport-order-list-v3',
  pallets: 'palletSummaryState/current',
}

// Deliberately return no cursors, source identifiers or business data.
export function summarizeCostReadiness(states) {
  const tracking = states.tracking?.complete === true
  const reminders = states.reminders?.complete === true
  const list = states.list?.complete === true
  const palletState = states.pallets
  const pallets = palletState?.version === 1 && palletState?.status === 'ready'
    && typeof palletState.generation === 'string' && palletState.generation.length > 0 && palletState.tourCoverage === true
  const backgroundReady = tracking && reminders && list
  return { tracking, reminders, list, pallets, backgroundReady, dataReady: backgroundReady && pallets }
}

export function parseReadinessArguments(args, emulatorHost) {
  if (args.length !== 4 || args[0] !== '--project' || args[2] !== '--require' || !['background', 'all'].includes(args[3])) {
    throw new Error('usage')
  }
  const project = args[1]
  const emulator = Boolean(emulatorHost)
  if (emulator) {
    if (!/^127\.0\.0\.1:\d+$/.test(emulatorHost) || !/^demo-[a-z0-9-]+$/.test(project)) throw new Error('emulator-target')
  } else if (project !== 'db-bpl-drehpunkt-dev') throw new Error('dev-target-required')
  return { project, requirement: args[3], emulator }
}

async function main() {
  let app
  try {
    const { project, requirement, emulator } = parseReadinessArguments(process.argv.slice(2), process.env.FIRESTORE_EMULATOR_HOST)
    app = initializeApp({ projectId: project }, 'cost-release-readiness')
    const db = getFirestore(app)
    const keys = Object.keys(costReadinessPaths)
    const snapshots = await db.getAll(...keys.map((key) => db.doc(costReadinessPaths[key])))
    const states = Object.fromEntries(keys.map((key, index) => [key, snapshots[index].data()]))
    const readiness = summarizeCostReadiness(states)
    process.stdout.write(`${JSON.stringify({ project, emulator, ...readiness }, null, 2)}\n`)
    process.exitCode = (requirement === 'all' ? readiness.dataReady : readiness.backgroundReady) ? 0 : 2
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) : 'readiness-check-failed'
    process.stderr.write(`${JSON.stringify({ code, message: 'Readiness konnte nicht geprüft werden. Explizites Dev-Ziel, Argumente und bestehende Leseberechtigung prüfen.' })}\n`)
    process.exitCode = 1
  } finally {
    if (app) await deleteApp(app)
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
