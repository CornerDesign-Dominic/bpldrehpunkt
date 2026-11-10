import { createHash, randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

const options = { region: 'europe-west3', enforceAppCheck: true }
const validId = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value)
const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 1440
export function requireTimeTemplateAdmin(profile) {
  if (profile?.active !== true || profile.role !== 'superadmin') throw new HttpsError('permission-denied', 'Arbeitszeitvorlagen sind ausschließlich für aktive Superadmins verfügbar.')
}
export function cleanTimeTemplate(input = {}) {
  const name = typeof input.name === 'string' ? input.name.normalize('NFKC').trim().replace(/\s+/g, ' ') : ''
  if (!name || name.length > 80) throw new HttpsError('invalid-argument', 'Bitte einen Vorlagennamen mit höchstens 80 Zeichen angeben.')
  const weekdays = {}
  for (let day = 0; day < 7; day++) {
    const entry = input.weekdays?.[day] || { targetMinutes: 0, breaks: [] }
    if (!integer(entry.targetMinutes) || !Array.isArray(entry.breaks) || entry.breaks.length > 20) throw new HttpsError('invalid-argument', 'Sollzeit oder Pausenstufen sind ungültig.')
    let previousThreshold = -1
    let previousRequired = 0
    weekdays[day] = { targetMinutes: entry.targetMinutes, breaks: [...entry.breaks].sort((a, b) => a.afterMinutes - b.afterMinutes).map(rule => {
      if (!integer(rule.afterMinutes) || !integer(rule.requiredMinutes) || rule.afterMinutes <= previousThreshold || rule.requiredMinutes < previousRequired) throw new HttpsError('invalid-argument', 'Pausengrenzen müssen eindeutig und Gesamtpausen aufsteigend sein.')
      previousThreshold = rule.afterMinutes; previousRequired = rule.requiredMinutes
      return { afterMinutes: rule.afterMinutes, requiredMinutes: rule.requiredMinutes }
    }) }
  }
  const holidayCountryCode = input.holidayCountryCode || 'DE'
  if (typeof holidayCountryCode !== 'string' || !/^[A-Z]{2}$/.test(holidayCountryCode)) throw new HttpsError('invalid-argument', 'Ungültiges Feiertagsland.')
  const region = input.holidaySubdivisionCode || ''
  if (typeof region !== 'string') throw new HttpsError('invalid-argument', 'Ungültige Feiertagsregion.')
  const holidaySubdivisionCode = region.replace(new RegExp(`^${holidayCountryCode}-`), '')
  if (holidaySubdivisionCode && !/^[A-Z0-9]{1,5}$/.test(holidaySubdivisionCode)) throw new HttpsError('invalid-argument', 'Ungültige Feiertagsregion.')
  return { name, weekdays, holidayCountryCode, holidaySubdivisionCode }
}
const nameKey = name => createHash('sha256').update(name.toLocaleLowerCase('de-DE')).digest('hex')
const cleanEntry = (id, value) => ({ id, ...cleanTimeTemplate(value), revision: value.revision, archived: value.archived === true })

export async function persistTimeTemplate(db, actorId, input) {
  const template = cleanTimeTemplate(input)
  const templateId = input.id || randomUUID()
  if (!validId(templateId) || (input.id && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1))) throw new HttpsError('invalid-argument', 'Bitte den aktuellen Vorlagenstand neu laden.')
  return db.runTransaction(async transaction => {
    const ref = db.doc(`timeWorkModelTemplates/${templateId}`)
    const keyRef = db.doc(`timeWorkModelTemplateNames/${nameKey(template.name)}`)
    const [old, key, actor] = await Promise.all([transaction.get(ref), transaction.get(keyRef), transaction.get(db.doc(`users/${actorId}`))])
    requireTimeTemplateAdmin(actor.data())
    const previous = old.data()
    if (input.id && !old.exists) throw new HttpsError('not-found', 'Vorlage nicht gefunden.')
    if (old.exists && (previous.archived || previous.revision !== input.expectedRevision)) throw new HttpsError('aborted', 'Die Vorlage wurde zwischenzeitlich geändert. Bitte neu laden.')
    if (key.exists && key.data().active === true && key.data().templateId !== templateId) throw new HttpsError('already-exists', 'Eine aktive Vorlage mit diesem Namen existiert bereits.')
    const oldKeyRef = previous && nameKey(previous.name) !== nameKey(template.name) ? db.doc(`timeWorkModelTemplateNames/${nameKey(previous.name)}`) : null
    const oldKey = oldKeyRef ? await transaction.get(oldKeyRef) : null
    const now = FieldValue.serverTimestamp()
    const revision = (previous?.revision || 0) + 1
    transaction.set(ref, { ...template, revision, archived: false, updatedAt: now, updatedBy: actorId, ...(old.exists ? {} : { createdAt: now, createdBy: actorId }) }, { merge: true })
    transaction.set(keyRef, { templateId, active: true })
    if (oldKey?.data()?.templateId === templateId) transaction.set(oldKeyRef, { templateId, active: false })
    transaction.create(db.doc(`timeWorkModelTemplates/${templateId}/history/${randomUUID()}`), { kind: old.exists ? 'updated' : 'created', before: previous ? cleanEntry(templateId, previous) : null, after: { ...template, revision }, createdBy: actorId, createdAt: now })
    return { template: { id: templateId, ...template, revision, archived: false } }
  })
}
export async function persistTimeTemplateArchive(db, actorId, input = {}) {
  if (!validId(input.id) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw new HttpsError('invalid-argument', 'Bitte den aktuellen Vorlagenstand neu laden.')
  return db.runTransaction(async transaction => {
    const ref = db.doc(`timeWorkModelTemplates/${input.id}`)
    const [old, actor] = await Promise.all([transaction.get(ref), transaction.get(db.doc(`users/${actorId}`))])
    requireTimeTemplateAdmin(actor.data())
    if (!old.exists) throw new HttpsError('not-found', 'Vorlage nicht gefunden.')
    const value = old.data()
    if (value.archived || value.revision !== input.expectedRevision) throw new HttpsError('aborted', 'Die Vorlage wurde zwischenzeitlich geändert. Bitte neu laden.')
    const keyRef = db.doc(`timeWorkModelTemplateNames/${nameKey(value.name)}`)
    const key = await transaction.get(keyRef)
    const now = FieldValue.serverTimestamp()
    transaction.set(ref, { archived: true, revision: value.revision + 1, archivedAt: now, archivedBy: actorId, updatedAt: now, updatedBy: actorId }, { merge: true })
    if (key.data()?.templateId === input.id) transaction.set(keyRef, { templateId: input.id, active: false })
    transaction.create(db.doc(`timeWorkModelTemplates/${input.id}/history/${randomUUID()}`), { kind: 'archived', before: cleanEntry(input.id, value), createdBy: actorId, createdAt: now })
    return { id: input.id, archived: true, revision: value.revision + 1 }
  })
}
export const listTimeWorkModelTemplates = onCall(options, async request => {
  requireTimeTemplateAdmin(await requireActiveProfile(request))
  const snapshot = await getFirestore().collection('timeWorkModelTemplates').where('archived', '==', false).get()
  return { templates: snapshot.docs.map(doc => cleanEntry(doc.id, doc.data())).sort((a, b) => a.name.localeCompare(b.name, 'de')) }
})
export const saveTimeWorkModelTemplate = onCall(options, async request => {
  requireTimeTemplateAdmin(await requireActiveProfile(request))
  return persistTimeTemplate(getFirestore(), request.auth.uid, request.data || {})
})
export const archiveTimeWorkModelTemplate = onCall(options, async request => {
  requireTimeTemplateAdmin(await requireActiveProfile(request))
  return persistTimeTemplateArchive(getFirestore(), request.auth.uid, request.data || {})
})
