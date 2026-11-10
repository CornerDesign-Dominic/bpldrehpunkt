import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, loadEnv } from 'vite'

export const TIME_WEB_DEV_PROJECT = 'db-bpl-drehpunkt-dev'
const root = fileURLToPath(new URL('../', import.meta.url))
const mode = 'development'

// Vite gives process-level VITE_* settings precedence over dotenv files.
// Check the effective target, so a production shell setting cannot silently
// override the development .env.local configuration during a preview deploy.
export function assertTimeWebDevEnvironment(fileEnvironment, processEnvironment = {}) {
  const projectId = processEnvironment.VITE_FIREBASE_PROJECT_ID ?? fileEnvironment.VITE_FIREBASE_PROJECT_ID
  const appId = processEnvironment.VITE_FIREBASE_APP_ID ?? fileEnvironment.VITE_FIREBASE_APP_ID
  if (projectId !== TIME_WEB_DEV_PROJECT) throw new Error(`Dev-Web-Build abgebrochen: VITE_FIREBASE_PROJECT_ID muss ${TIME_WEB_DEV_PROJECT} sein.`)
  if (typeof appId !== 'string' || !appId.trim()) throw new Error('Dev-Web-Build abgebrochen: VITE_FIREBASE_APP_ID fehlt.')
  return { projectId, appId }
}

export async function buildTimeWebDev(args = []) {
  if (args.length) throw new Error('Dieser Dev-Web-Build akzeptiert keine Projekt- oder Modusüberschreibungen.')
  const target = assertTimeWebDevEnvironment(loadEnv(mode, root, 'VITE_'), process.env)
  await build({ root, mode })
  // Public deployment evidence only. Never write API keys, auth credentials,
  // App Check tokens or the complete Vite environment to build artefacts.
  await writeFile(new URL('../dist/firebase-target.json', import.meta.url), `${JSON.stringify({ ...target, builtAt: new Date().toISOString() }, null, 2)}\n`)
  console.log(`Firebase-Dev-Web-Build verifiziert: ${target.projectId}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  buildTimeWebDev(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1 })
}
