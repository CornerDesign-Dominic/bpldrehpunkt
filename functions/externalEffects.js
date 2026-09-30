import process from 'node:process'
import { logger } from 'firebase-functions'

export const productionProjectId = 'db-bpl-drehpunkt'
export const developmentProjectId = 'db-bpl-drehpunkt-dev'

function cleanProjectId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// Cloud Functions provides GCLOUD_PROJECT. GOOGLE_CLOUD_PROJECT is retained for
// the Cloud Run-based Gen 2 runtime name. Unknown runtime contexts fail closed.
export function runtimeProjectId(environment = process.env) {
  return cleanProjectId(environment?.GCLOUD_PROJECT) || cleanProjectId(environment?.GOOGLE_CLOUD_PROJECT)
}

export function externalEffectsEnvironment(environment = process.env) {
  const projectId = runtimeProjectId(environment)
  if (projectId === productionProjectId) return 'production'
  if (projectId === developmentProjectId) return 'development'
  return 'unknown'
}

export function externalEffectsAllowed(environment = process.env) {
  return externalEffectsEnvironment(environment) === 'production'
}

export function publicDataSynchronizationAllowed(environment = process.env) {
  return ['production', 'development'].includes(externalEffectsEnvironment(environment))
}

export function logExternalEffectsSkipped(effect, environment = process.env) {
  logger.info('Externe Function-Wirkung außerhalb der Produktion übersprungen.', {
    effect,
    environment: externalEffectsEnvironment(environment),
    projectId: runtimeProjectId(environment) || 'unknown',
  })
}
