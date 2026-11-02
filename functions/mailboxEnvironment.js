import { HttpsError } from 'firebase-functions/v2/https'
import { developmentProjectId, productionProjectId } from './externalEffects.js'

export const developmentMailboxClientId = 'a23dc8d8-e22a-40ef-997c-d28aa753ee29'

export function assertMailboxEnvironment(projectId) {
  if (![developmentProjectId, productionProjectId].includes(projectId)) throw new HttpsError('failed-precondition', 'Die Postfachanbindung ist für diese Umgebung nicht freigegeben.')
}

export function resolveMailboxClientId(projectId, configuredClientId = '') {
  assertMailboxEnvironment(projectId)
  const clientId = configuredClientId || (projectId === developmentProjectId ? developmentMailboxClientId : '')
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(clientId) || projectId === productionProjectId && clientId.toLowerCase() === developmentMailboxClientId) {
    throw new HttpsError('failed-precondition', 'Die Microsoft-Anwendung ist für diese Umgebung noch nicht eingerichtet.')
  }
  return clientId
}

export function recommendationWebhookUrl(projectId) {
  assertMailboxEnvironment(projectId)
  return `https://europe-west3-${projectId}.cloudfunctions.net/mailboxRecommendationWebhook`
}

export function assertMailboxOAuthConfiguration({ project, redirect, origin }) {
  assertMailboxEnvironment(project)
  try {
    const frontend = new URL(origin)
    if (frontend.protocol !== 'https:' || frontend.origin !== origin || frontend.username || frontend.password) throw new Error()
    if (project === productionProjectId && (frontend.hostname === 'dev.drehpunktlogistik.de' || redirect !== `https://europe-west3-${productionProjectId}.cloudfunctions.net/mailboxOAuthCallback`)) throw new Error()
    if (new URL(redirect).protocol !== 'https:') throw new Error()
  } catch {
    throw new HttpsError('failed-precondition', 'Die Microsoft-Rücksprungadresse ist für diese Umgebung noch nicht eingerichtet.')
  }
}
