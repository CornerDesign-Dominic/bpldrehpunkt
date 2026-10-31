import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

const levels = { none: 0, view: 1, edit: 2 }
const text = (value) => typeof value === 'string' ? value.trim() : ''
const database = () => getFirestore()

function hasImportAccess(profile) { return profile?.role === 'superadmin' || levels[profile?.permissions?.dataImports] >= levels.edit }
async function assertImportAccess(request) {
  const profile = await requireActiveProfile(request)
  if (!hasImportAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Datenimporte.')
  return profile
}

function importRunSummary(snapshot) {
  const data = snapshot.data() || {}
  return {
    id: snapshot.id,
    fileName: text(data.fileName),
    source: text(data.source),
    externalNumber: text(data.externalNumber),
    importedAt: data.importedAt?.toMillis?.() || null,
    importedByName: text(data.importedByName),
    counts: data.counts || {},
  }
}

export async function listTransportOrderImportRunsHandler(request) {
  await assertImportAccess(request)
  const db = database(); const runId = text(request.data?.runId)
  if (runId) {
    const snapshot = await db.doc(`transportOrderImportRuns/${runId}`).get()
    if (!snapshot.exists) throw new HttpsError('not-found', 'Dieser Importlauf wurde nicht gefunden.')
    const rows = await snapshot.ref.collection('rows').orderBy('rowNumber', 'asc').get()
    return { run: importRunSummary(snapshot), rows: rows.docs.map((entry) => ({ id: entry.id, ...entry.data() })) }
  }
  const snapshots = await db.collection('transportOrderImportRuns').orderBy('importedAt', 'desc').limit(100).get()
  return { runs: snapshots.docs.map(importRunSummary) }
}
