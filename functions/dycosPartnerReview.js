import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { hasDycosMasterDataAccess, dycosPartnerFieldPaths } from './dycosPartnerData.js'
import { recordDiagnostic } from './diagnostics.js'
import { dycosConflictKey, dycosConflictRows, retainedDycosResolutions } from './shared/dycosPartnerConflicts.js'
import { businessPartnerHistoryChanges, mergePartnerHistoryPatch } from './shared/businessPartnerHistory.js'

const changed = () => new HttpsError('aborted', 'Der Vergleich wurde inzwischen geändert. Bitte die Seite neu laden und erneut prüfen.')
const actorName = profile => [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || 'Unbekannt'

export async function resolveDycosPartnerConflictsHandler(request, { db = getFirestore(), report = recordDiagnostic } = {}) {
  const profile = await requireActiveProfile(request)
  if (!hasDycosMasterDataAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Bearbeitung von Stammdaten.')
  const { partnerId, decision, expectedRows } = request.data || {}
  if (typeof partnerId !== 'string' || !partnerId || partnerId.length > 200 || partnerId.includes('/') || !['accept', 'keep'].includes(decision) || !Array.isArray(expectedRows) || expectedRows.length !== 1) throw new HttpsError('invalid-argument', 'Bitte genau eine Abweichung zur Entscheidung auswählen.')
  try {
    return await db.runTransaction(async tx => {
      const ref = db.doc(`businessPartners/${partnerId}`)
      const [snapshot, user] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${request.auth.uid}`))])
      if (user.get('active') !== true || !hasDycosMasterDataAccess(user.data())) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Bearbeitung von Stammdaten.')
      if (!snapshot.exists) throw new HttpsError('not-found', 'Der Geschäftspartner wurde nicht gefunden.')
      const partner = snapshot.data()
      if (partner.mergedIntoPartnerId || partner.status === 'merged') throw changed()
      const available = dycosConflictRows(partner)
      const selected = available.find(row => JSON.stringify(row) === JSON.stringify(expectedRows[0]))
      if (!selected) throw changed()
      const rows = [selected]
      const now = FieldValue.serverTimestamp(), name = actorName(user.data())
      const metadata = { ...partner.dycosImport, reviewedAt: now, reviewedByUserId: request.auth.uid, reviewedByName: name, reviewDecision: decision }
      metadata.resolutions = retainedDycosResolutions(partner).filter(item => dycosConflictKey(item) !== dycosConflictKey(selected))
      const patch = {}
      if (decision === 'accept') {
        for (const row of rows) {
          if (!row.resolvable) throw new HttpsError('failed-precondition', 'Dieser Vergleich benötigt einen erneuten DyCoS-Abruf oder eine manuelle Prüfung.')
          if (!dycosPartnerFieldPaths.includes(row.path) && !/^contacts\.\d+\.(name|department|departmentOther|phone|mobile)$/.test(row.path)) throw changed()
          if (!['string', 'boolean', 'number'].includes(typeof row.incomingValue) || typeof row.incomingValue === 'string' && row.incomingValue.length > 4000) throw changed()
          const keys = row.path.split('.')
          if (keys[0] === 'contacts') {
            patch.contacts ||= structuredClone(partner.contacts)
            patch.contacts[Number(keys[1])][keys[2]] = row.incomingValue
          } else if (keys.length === 1) patch[keys[0]] = row.incomingValue
          else { patch[keys[0]] ||= {}; patch[keys[0]][keys[1]] = row.incomingValue }
        }
      } else {
        // Keep decisions are tied to both displayed values. A later source or
        // manual change opens a fresh comparison instead of hiding it forever.
        metadata.resolutions.push({ path: selected.path, currentValue: selected.currentValue, incomingValue: selected.incomingValue, decision: 'keep', ...(selected.contactId ? { contactId: selected.contactId } : {}) })
      }
      const next = mergePartnerHistoryPatch(partner, patch)
      const changes = businessPartnerHistoryChanges(partner, next)
      const update = { dycosImport: metadata }
      for (const [key, value] of Object.entries(patch)) update[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...(partner[key] || {}), ...value } : value
      if (changes.length) Object.assign(update, { updatedAt: now, updatedByUserId: request.auth.uid, updatedByName: name })
      tx.update(ref, update)
      tx.create(ref.collection('history').doc(), { category: 'masterData', action: 'updated', source: 'dycos-review', summary: decision === 'accept' ? 'Abweichende DyCoS-Stammdaten übernommen' : 'Drehpunkt-Stammdaten bewusst beibehalten', metadata: { changes, decision, reviewedFields: rows.map(row => row.path) }, createdAt: now, createdByUserId: request.auth.uid, createdByName: name })
      return { partnerId, decision, changedFields: changes.length }
    })
  } catch (error) {
    if (!(error instanceof HttpsError)) {
      try { await report({ module: 'dycos-master-data', stage: 'review', code: 'dycos_partner_review_failed', message: 'Die Stammdatenentscheidung konnte nicht gespeichert werden.', actorId: request.auth.uid, actorName: actorName(profile), recordId: partnerId }, db) } catch { /* Preserve safe original failure. */ }
      throw new HttpsError('internal', 'Die Stammdatenentscheidung konnte nicht gespeichert werden. Bitte erneut versuchen.')
    }
    throw error
  }
}
