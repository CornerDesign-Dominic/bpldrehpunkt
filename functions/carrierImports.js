import { businessPartnerHistoryChanges, mergePartnerHistoryPatch } from './shared/businessPartnerHistory.js'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { canApproveCustomerImportRow, canClaimCustomerImportRow } from './customerImports.js'
import { projectAcceptedCustomerImportRow, reviewedCustomerImportResult } from './customerImportResults.js'
import { hasPartnerMergeAccess } from './partnerMerges.js'
import { partnerMergePreview } from './partnerMergeDecisions.js'
import { carrierReadPath, hasCarrierImportAccess, sameCarrierValue } from './carrierImportModel.js'

const text = (value) => value === null || value === undefined ? '' : String(value).trim()
const actorName = (profile) => [text(profile?.firstName), text(profile?.lastName)].filter(Boolean).join(' ') || text(profile?.email) || 'Unbekannt'
const lockDurationMs = 5 * 60 * 1000
const rowCollection = 'carrierImportRows'
const runCollection = 'carrierImportRuns'

async function access(request) {
  const profile = await requireActiveProfile(request)
  if (!hasCarrierImportAccess(profile)) throw new HttpsError('permission-denied', 'Für Unternehmerimporte werden Datenimport- und Stammdaten-Bearbeitungsrechte benötigt.')
  return profile
}

const partner = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })
const publicRow = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })
const millis = (value) => value?.toMillis?.() || 0
export async function listCarrierImportQueueHandler(request) {
  await access(request)
  const db = getFirestore(); const runId = text(request.data?.runId)
  const [openSnapshot, acceptedSnapshot] = await Promise.all([db.collection(rowCollection).where('state', '==', 'open').get(), db.collection(rowCollection).where('state', '==', 'accepted').get()])
  const sort = (a, b) => millis(b.updatedAt) - millis(a.updatedAt)
  const accepted = acceptedSnapshot.docs.map(publicRow).sort(sort)
  const partnerIds = [...new Set(accepted.map((row) => text(row.carrierId || row.approval?.targetPartnerId || row.result?.partnerId)).filter(Boolean))]
  const runIds = [...new Set(accepted.map((row) => text(row.runId)).filter(Boolean))]
  const partners = new Map(); const runs = {}
  for (let index = 0; index < partnerIds.length; index += 200) {
    const found = await db.getAll(...partnerIds.slice(index, index + 200).map((id) => db.collection('businessPartners').doc(id)))
    found.forEach((entry) => { if (entry.exists) partners.set(entry.id, { id: entry.id, companyName: entry.get('companyName') }) })
  }
  for (let index = 0; index < runIds.length; index += 200) {
    const found = await db.getAll(...runIds.slice(index, index + 200).map((id) => db.collection(runCollection).doc(id)))
    found.forEach((entry) => { if (entry.exists) runs[entry.id] = { id: entry.id, fileName: entry.get('fileName'), importedAt: entry.get('importedAt'), importedByName: entry.get('importedByName') } })
  }
  const project = (row) => projectAcceptedCustomerImportRow(row, partners.get(text(row.carrierId || row.approval?.targetPartnerId || row.result?.partnerId)))
  return { open: openSnapshot.docs.map(publicRow).sort(sort), accepted: accepted.map(project), currentAccepted: runId ? accepted.filter((row) => row.runId === runId).map(project) : [], runs }
}

export async function claimCarrierImportRowHandler(request) {
  const profile = await access(request); const runId = text(request.data?.runId); const rowId = text(request.data?.rowId)
  if (!runId || !rowId) throw new HttpsError('invalid-argument', 'Importlauf oder Prüfzeile fehlt.')
  const db = getFirestore(); const ref = db.collection(rowCollection).doc(rowId)
  const lock = { userId: request.auth.uid, userName: actorName(profile), expiresAt: Timestamp.fromMillis(Date.now() + lockDurationMs) }
  const row = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists || snapshot.data().runId !== runId || snapshot.data().state !== 'open') throw new HttpsError('failed-precondition', 'Diese Prüfzeile ist nicht mehr offen.')
    const current = snapshot.data()
    if (!canClaimCustomerImportRow(current, request.auth.uid)) throw new HttpsError('failed-precondition', `Diese Prüfzeile wird bereits von ${current.lock?.userName || 'einem anderen Nutzer'} geprüft.`)
    let comparisons = current.comparisons || []; let merge = current.merge || null
    if (current.kind === 'merge' && Array.isArray(merge?.partnerIds)) {
      if (!hasPartnerMergeAccess(profile)) throw new HttpsError('permission-denied', 'Für die Zusammenführung wird die Berechtigung „Partner zusammenführen“ benötigt.')
      const snapshots = await Promise.all(merge.partnerIds.map((id) => transaction.get(db.collection('businessPartners').doc(id))))
      merge = { ...merge, partners: snapshots.filter((entry) => entry.exists).map((entry) => ({ ...partnerMergePreview(partner(entry)), version: entry.updateTime.toMillis() })) }
    }
    let carrierId = current.carrierId || null
    if (carrierId && current.kind !== 'merge') {
      let carrierSnapshot = await transaction.get(db.collection('businessPartners').doc(carrierId))
      if (!carrierSnapshot.exists) throw new HttpsError('failed-precondition', 'Das zu prüfende Stammdatenblatt wurde nicht gefunden.')
      if (carrierSnapshot.data().mergedIntoPartnerId) {
        carrierSnapshot = await transaction.get(db.collection('businessPartners').doc(carrierSnapshot.data().mergedIntoPartnerId))
        if (!carrierSnapshot.exists || carrierSnapshot.data().mergedIntoPartnerId || carrierSnapshot.data().status === 'merged') throw new HttpsError('failed-precondition', 'Die Partner-Weiterleitung ist nicht eindeutig. Bitte die Stammdaten prüfen.')
      }
      carrierId = carrierSnapshot.id
      comparisons = comparisons.map((item) => {
        const currentValue = carrierReadPath(carrierSnapshot.data(), item.path)
        return { ...item, currentValue: currentValue ?? '', current: currentValue === null || currentValue === undefined || currentValue === '' ? '—' : text(currentValue) }
      })
    }
    transaction.update(ref, { lock, carrierId, ...(carrierId !== current.carrierId && !current.originalCarrierId ? { originalCarrierId: current.carrierId } : {}), comparisons, updatedAt: FieldValue.serverTimestamp() })
    return { id: snapshot.id, ...current, carrierId, comparisons, merge, lock }
  })
  return { row }
}

export async function releaseCarrierImportRowHandler(request) {
  await access(request); const rowId = text(request.data?.rowId); if (!rowId) return { released: false }
  const ref = getFirestore().collection(rowCollection).doc(rowId)
  await getFirestore().runTransaction(async (transaction) => { const snapshot = await transaction.get(ref); if (snapshot.exists && snapshot.data().lock?.userId === request.auth.uid) transaction.update(ref, { lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }) })
  return { released: true }
}

function assign(target, current, path, value) {
  const parts = path.split('.')
  if (parts[0] === 'contacts') {
    const contacts = target.contacts || (current.contacts || []).map((entry) => ({ ...entry }))
    if (!contacts[Number(parts[1])]) throw new HttpsError('failed-precondition', 'Der Kontakt wurde inzwischen geändert. Bitte die Prüfzeile neu öffnen.')
    contacts[Number(parts[1])][parts[2]] = value; target.contacts = contacts
  } else if (parts.length === 2) target[parts[0]] = { ...(current[parts[0]] || {}), ...(target[parts[0]] || {}), [parts[1]]: value }
  else target[path] = value
}

export async function approveCarrierImportRowHandler(request) {
  const profile = await access(request); const runId = text(request.data?.runId); const rowId = text(request.data?.rowId)
  const approvedValues = request.data?.approvedValues && typeof request.data.approvedValues === 'object' ? request.data.approvedValues : {}
  if (!runId || !rowId) throw new HttpsError('invalid-argument', 'Importlauf oder Prüfzeile fehlt.')
  const db = getFirestore(); const rowRef = db.collection(rowCollection).doc(rowId)
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rowRef)
    if (!snapshot.exists || snapshot.data().runId !== runId || snapshot.data().state !== 'open') throw new HttpsError('failed-precondition', 'Diese Prüfzeile wurde bereits bearbeitet.')
    const row = snapshot.data()
    if (row.kind === 'merge' || row.kind === 'error' || !row.carrierId) throw new HttpsError('failed-precondition', 'Diese Zeile kann nicht als normale Unternehmerprüfung übernommen werden.')
    if (!canApproveCustomerImportRow(row, request.auth.uid)) throw new HttpsError('failed-precondition', 'Die Prüfreservierung ist abgelaufen oder gehört einem anderen Nutzer.')
    const carrierRef = db.collection('businessPartners').doc(row.carrierId)
    const carrierSnapshot = await transaction.get(carrierRef)
    if (!carrierSnapshot.exists || carrierSnapshot.data().mergedIntoPartnerId) throw new HttpsError('failed-precondition', 'Der Unternehmer wurde inzwischen zusammengeführt. Bitte die Prüfzeile neu öffnen.')
    const carrier = carrierSnapshot.data(); const updates = {}
    for (const item of row.comparisons || []) {
      const actual = carrierReadPath(carrier, item.path)
      if (!sameCarrierValue(item.path, actual, item.currentValue)) throw new HttpsError('failed-precondition', `Der aktuelle Wert für ${item.label} wurde inzwischen geändert. Bitte die Prüfzeile neu öffnen.`)
      let value = approvedValues[item.path] ?? item.incomingValue
      value = text(value)
      assign(updates, carrier, item.path, value)
    }
    transaction.set(carrierRef, { ...updates, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    const approval = { type: 'reviewed', at: FieldValue.serverTimestamp(), byUserId: request.auth.uid, byName: actorName(profile), previousValues: Object.fromEntries((row.comparisons || []).map((item) => [item.path, item.currentValue])), appliedValues: updates }
    transaction.set(carrierRef.collection('history').doc(), { category: 'import', action: 'reviewed', summary: 'Unternehmerimport geprüft übernommen', source: 'dycosCarrierImport', importRunId: runId, metadata: { changes: businessPartnerHistoryChanges(carrier, mergePartnerHistoryPatch(carrier, updates)) }, actor: { userId: request.auth.uid, name: actorName(profile) }, previousValues: approval.previousValues, appliedValues: updates, createdAt: FieldValue.serverTimestamp() })
    const reviewed = reviewedCustomerImportResult(row.result, carrierRef.id, updates)
    transaction.update(rowRef, { state: 'accepted', result: reviewed, approval, lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
    return { id: rowId, creditorNumber: row.creditorNumber, companyName: row.companyName, approvalType: 'geprüft übernommen', carrierId: carrierRef.id, result: reviewed, affectedPartner: { id: carrierRef.id, companyName: updates.companyName || carrier.companyName || '' } }
  })
  return { row: result }
}
