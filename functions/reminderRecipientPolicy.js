import { externalEffectsEnvironment } from './externalEffects.js'

export const developmentReminderRecipient = 'no-reply@brennpunkt-logistik.de'

/** Runtime-only delivery policy. No request field can widen this allowlist.
 * Eligibility/permissions remain separately enforced with current user data. */
export function reminderRecipientPolicy(recipient, environment = externalEffectsEnvironment()) {
  if (environment === 'production') return { allowed: true }
  if (environment === 'development') return recipient === developmentReminderRecipient
    ? { allowed: true }
    : { allowed: false, code: 'development-recipient-not-authorized', reason: 'Dev-Testmodus: Erinnerungen dürfen nur an die freigegebene Testadresse gesendet werden.' }
  return { allowed: false, code: 'unsupported-environment', reason: 'Der Erinnerungsversand ist in dieser Umgebung nicht freigegeben.' }
}
