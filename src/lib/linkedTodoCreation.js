import { businessPartnerRoles } from '../../shared/businessPartnerRoles.js'

const linkedCaseFields = new Set(['damageCaseId', 'insolvencyId', 'legalDisputeId', 'inkassoCaseId'])

function validCaseId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 240
    && value !== '.' && value !== '..' && !value.includes('/')
    && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}

// The case is fixed, while all editable suggestions belong to the user's form.
// In particular, a merge never replaces an inherited original partner ID here.
export function linkedTodoSubmission(values, fixedLink) {
  if (!linkedCaseFields.has(fixedLink?.field) || !validCaseId(fixedLink?.id)) {
    throw Object.assign(new Error('Die Fallverknüpfung ist ungültig. Bitte den Fall erneut öffnen.'), { code: 'invalid-argument' })
  }
  return { ...values, [fixedLink.field]: fixedLink.id }
}

export function linkedTodoCreationMessage(error) {
  const code = String(error?.code || '').replace(/^(firestore|functions)\//, '')
  if (code === 'permission-denied') return 'Das To-do konnte nicht gespeichert werden. Bitte prüfe die Verknüpfungen und deine Berechtigungen oder öffne den Vorgang erneut.'
  if (['unavailable', 'deadline-exceeded', 'unknown'].includes(code)) return 'Die Speicherung konnte nicht bestätigt werden. Prüfe bitte die To-do-Liste, bevor du erneut speicherst.'
  return error?.message || 'Das To-do konnte nicht gespeichert werden.'
}

export function linkedTodoPartnerChoices(partners, role, fixedLink) {
  const active = partners.filter((partner) => !partner.mergedIntoPartnerId && partner.status !== 'merged' && businessPartnerRoles(partner)[role])
  const id = fixedLink?.values?.[`${role}Id`]
  const name = fixedLink?.values?.[`${role}Name`]
  if (!id || active.some((partner) => partner.id === id)) return active
  // A known source case already supplied this option. Keep it available after
  // a temporary change or unlink, including when master data is not readable.
  return [...active, { id, companyName: name || '', inheritedTodoOrigin: true }]
}
