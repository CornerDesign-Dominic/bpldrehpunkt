import { defineSecret } from 'firebase-functions/params'
import { createEntraClientCredentialsProvider, EntraClientCredentialsError } from './entraClientCredentials.js'

const parameters = Object.fromEntries(Object.entries({ tenantId: 'REMINDER_TENANT_ID', clientId: 'REMINDER_CLIENT_ID', servicePrincipalId: 'REMINDER_SERVICE_PRINCIPAL_ID', certificatePem: 'REMINDER_CERTIFICATE_PEM', privateKeyPem: 'REMINDER_PRIVATE_KEY_PEM' }).map(([key, name]) => [key, defineSecret(name)]))
export const reminderFlowConfigurationSecrets = Object.values(parameters)
const messages = {
  configuration: 'Die zertifikatsbasierte Anmeldung für Erinnerungen ist nicht korrekt eingerichtet.',
  authentication: 'Die Anmeldung für den Erinnerungsversand wurde abgelehnt.',
  timeout: 'Die Anmeldung für den Erinnerungsversand hat nicht rechtzeitig geantwortet.',
  unavailable: 'Die Anmeldung für den Erinnerungsversand ist derzeit nicht erreichbar.',
  invalid_response: 'Die Anmeldung für den Erinnerungsversand hat eine ungültige Antwort geliefert.',
  aborted: 'Die Anmeldung für den Erinnerungsversand wurde abgebrochen.',
}
const codes = { configuration: 'configuration', authentication: 'failed', timeout: 'timeout', unavailable: 'unavailable', invalid_response: 'invalid_response', aborted: 'aborted' }
export class ReminderFlowAuthError extends Error {
  constructor(kind) { super(messages[kind]); this.name = 'ReminderFlowAuthError'; this.code = `reminder_auth_${codes[kind]}`; this.stage = 'authenticate' }
}
export function createReminderFlowAuthorizationProvider(options = {}) {
  const provider = createEntraClientCredentialsProvider({ config: options.config || (() => Object.fromEntries(Object.entries(parameters).map(([key, parameter]) => [key, parameter.value()]))), fetchImpl: options.fetchImpl, now: options.now, timeoutMs: options.timeoutMs, audience: 'https://service.flow.microsoft.com/' })
  return async (request = {}) => {
    try { return await provider(request) }
    catch (error) { throw new ReminderFlowAuthError(error instanceof EntraClientCredentialsError ? error.code : 'configuration') }
  }
}
const defaultProvider = createReminderFlowAuthorizationProvider()
export function getReminderFlowAuthorization(options = {}) {
  const { signal, ...configuration } = options
  return Object.keys(configuration).length ? createReminderFlowAuthorizationProvider(configuration)({ signal }) : defaultProvider({ signal })
}
