import { httpsCallable } from 'firebase/functions'
import { auth, authPersistenceReady, firebaseApp, functions, waitForAppCheckToken } from './firebase'

// Operator entry point for the local Vite session. No automatic migration and
// no access-token handling; each callable enforces active superadmin + App Check.
async function preparePage(name) {
  if (!import.meta.env.DEV || firebaseApp.options.projectId !== 'db-bpl-drehpunkt-dev') {
    throw new Error('Die Releasevorbereitung ist nur lokal gegen das Dev-Projekt erlaubt.')
  }
  await authPersistenceReady
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Bitte zuerst mit dem freigegebenen Superadmin-Konto anmelden.')
  await waitForAppCheckToken()
  return (await httpsCallable(functions, name, { timeout: 540000 })({})).data
}

export function prepareBackgroundWorkPage() { return preparePage('prepareBackgroundWork') }
export function rebuildPalletSummariesPage() { return preparePage('rebuildPalletSummaries') }
