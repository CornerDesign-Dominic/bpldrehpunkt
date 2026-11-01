import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'

const caseModules = Object.freeze({ damageCases: 'damages', inkassoCases: 'inkasso', legalDisputes: 'legalDisputes', insolvencies: 'insolvencies' })
const identifier = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 240 && !value.includes('/') && [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
const displayName = (profile) => [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim().slice(0, 120) || String(profile?.displayName || '').trim().slice(0, 120) || 'Benutzer ohne Namen'
const hasAccess = (profile, module, edit = false) => profile?.active === true && (profile.role === 'superadmin' || (edit ? profile.permissions?.[module] === 'edit' : ['view', 'edit'].includes(profile.permissions?.[module])))
export function reminderCasePath(value) {
  const parts = typeof value === 'string' ? value.split('/') : []
  if (parts.length !== 2 || !Object.hasOwn(caseModules, parts[0]) || !identifier(parts[1])) throw new HttpsError('invalid-argument', 'Ungültiger Vorgang für eine Zuständigkeit.')
  return { path: value, module: caseModules[parts[0]] }
}
function requireEditor(profile, module) {
  if (!hasAccess(profile, module, true)) throw new HttpsError('permission-denied', 'Keine Berechtigung zum Ändern der Zuständigkeit.')
}
async function diagnose(error, code, message, request, db) {
  if (error instanceof HttpsError) return
  try { await recordDiagnostic({ module: 'reminders', stage: 'responsibility', code, message, actorId: request.auth?.uid || 'unknown' }, db) } catch { /* Preserve the original failure if diagnosis also fails. */ }
}
export async function listCaseReminderUsersHandler(request, { db = getFirestore(), authorize = requireActiveProfile } = {}) {
  const target = reminderCasePath(request.data?.parentPath)
  requireEditor(await authorize(request), target.module)
  try {
    if (!(await db.doc(target.path).get()).exists) throw new HttpsError('not-found', 'Der Vorgang ist nicht mehr vorhanden.')
    const snapshot = await db.collection('users').where('active', '==', true).select('active', 'firstName', 'lastName', 'displayName', 'role', 'permissions', 'email').get()
    return { users: snapshot.docs.filter((entry) => hasAccess(entry.data(), target.module)).map((entry) => ({ id: entry.id, name: displayName(entry.data()), canReceiveMail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.get('email') || '') })).sort((left, right) => left.name.localeCompare(right.name, 'de')) }
  } catch (error) {
    await diagnose(error, 'recipient-directory-failed', 'Zuständige Personen konnten nicht geladen werden.', request, db)
    throw error
  }
}
export async function setReminderResponsibilityHandler(request, { db = getFirestore(), authorize = requireActiveProfile } = {}) {
  const target = reminderCasePath(request.data?.parentPath)
  const userId = request.data?.userId
  const expectedUserId = request.data?.expectedUserId
  if (userId !== null && !identifier(userId) || expectedUserId !== null && !identifier(expectedUserId)) throw new HttpsError('invalid-argument', 'Bitte eine gültige zuständige Person auswählen.')
  requireEditor(await authorize(request), target.module)
  try {
    return await db.runTransaction(async (transaction) => {
      const parentRef = db.doc(target.path)
      const [actor, parent, recipient] = await Promise.all([
        transaction.get(db.doc(`users/${request.auth.uid}`)), transaction.get(parentRef),
        userId ? transaction.get(db.doc(`users/${userId}`)) : Promise.resolve(null),
      ])
      requireEditor(actor.exists ? actor.data() : null, target.module)
      if (!parent.exists) throw new HttpsError('not-found', 'Der Vorgang ist nicht mehr vorhanden.')
      if ((parent.get('responsibleUserId') || null) !== expectedUserId) throw new HttpsError('aborted', 'Die Zuständigkeit wurde zwischenzeitlich geändert. Bitte neu laden; deine Auswahl bleibt erhalten.')
      if (userId && (!recipient?.exists || !hasAccess(recipient.data(), target.module))) throw new HttpsError('failed-precondition', 'Die ausgewählte Person ist nicht aktiv oder hat keinen Zugriff auf diesen Bereich.')
      const responsibleUserName = userId ? displayName(recipient.data()) : null
      if ((parent.get('responsibleUserId') || null) === userId && (parent.get('responsibleUserName') || null) === responsibleUserName) return { responsibleUserId: userId, responsibleUserName, changed: false }
      const actorName = displayName(actor.data())
      transaction.update(parentRef, { responsibleUserId: userId, responsibleUserName, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, updatedByName: actorName })
      transaction.set(parentRef.collection('updates').doc(), { type: 'system', text: userId ? `Zuständigkeit auf ${responsibleUserName} geändert.` : 'Zuständigkeit entfernt.', createdByUserId: request.auth.uid, createdByName: actorName, createdAt: FieldValue.serverTimestamp() })
      return { responsibleUserId: userId, responsibleUserName, changed: true }
    })
  } catch (error) {
    await diagnose(error, 'responsibility-save-failed', 'Die Zuständigkeit konnte nicht gespeichert werden.', request, db)
    throw error
  }
}
