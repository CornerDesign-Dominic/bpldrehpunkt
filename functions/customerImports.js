import { businessPartnerHistoryChanges, mergePartnerHistoryPatch } from './shared/businessPartnerHistory.js'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { projectAcceptedCustomerImportRow, reviewedCustomerImportResult } from './customerImportResults.js'
import { partnerMergePreview } from './partnerMergeDecisions.js'
import { hasPartnerMergeAccess } from './partnerMerges.js'
import { resolveActivePartner } from './carrierImportModel.js'
import { paymentTermText } from './paymentTerms.js'

const text = (value) => typeof value === 'string' ? value.trim() : ''
const fieldLabels = { companyName: 'Firma', debtorNumber: 'Debitorennummer', language: 'Sprache', dycosCreatedAt: 'Erfasst am DyCoS', paymentTermDays: 'Zahlungsziel', creditNoteProcedure: 'Gutschriftverfahren', 'address.street': 'Straße', 'address.postalCode': 'PLZ', 'address.city': 'Ort', 'address.country': 'Land', 'contact.email': 'E-Mail', 'contact.website': 'Internet', 'companyData.vatId': 'UStID', 'companyData.taxNumber': 'Steuernummer', linkedCreditorNumber: 'Zugeordneter Unternehmer' }
const lockDurationMs = 5 * 60 * 1000
const identifierPaths = new Set(['debtorNumber', 'linkedCreditorNumber', 'creditorNumber', 'linkedCarrierReference.creditorNumber'])

export const hasCustomerImportAccess = (profile) => profile?.role === 'superadmin' || (profile?.permissions?.dataImports === 'edit' && profile?.permissions?.masterData === 'edit')
const actorName = (profile) => [text(profile?.firstName), text(profile?.lastName)].filter(Boolean).join(' ') || text(profile?.email) || 'Unbekannt'
const empty = (value) => value === '' || value === null || value === undefined
export const normalizeCustomerIdentifier = (value) => empty(value) ? '' : String(value).trim()
export const linkedCarrierReference = (creditorNumber, carrier = null) => ({ creditorNumber: normalizeCustomerIdentifier(creditorNumber), partnerId: carrier?.id || null })

export function sameCustomerImportValue(path, left, right) {
  if (empty(left) && empty(right)) return true
  if (identifierPaths.has(path)) return normalizeCustomerIdentifier(left) === normalizeCustomerIdentifier(right)
  if (typeof left === 'boolean' || typeof right === 'boolean') return Boolean(left) === Boolean(right)
  return String(left ?? '').trim() === String(right ?? '').trim()
}

async function access(request) {
  const profile = await requireActiveProfile(request)
  if (!hasCustomerImportAccess(profile)) throw new HttpsError('permission-denied', 'Für Kundenimporte werden Datenimport- und Stammdaten-Bearbeitungsrechte benötigt.')
  return profile
}

function partner(snapshot) {
  const data = snapshot.data()
  return { id: snapshot.id, ...data, address: data.address || {}, contact: data.contact || {}, companyData: data.companyData || {}, dycosReferences: data.dycosReferences || {}, contacts: data.contacts || [] }
}

const readPath = (source, path) => path.split('.').reduce((value, part) => value?.[part], source)
const display = (value) => value === true ? 'Ja' : value === false ? 'Nein' : empty(value) ? '—' : String(value)

function comparison(path, current, incoming) {
  return { path, label: fieldLabels[path] || path, current: display(current), incoming: display(incoming), currentValue: current ?? '', incomingValue: incoming ?? '' }
}

export function resolveCarrier(partners, creditorNumber) {
  const number = normalizeCustomerIdentifier(creditorNumber)
  if (!number) return null
  const matches = partners.filter((entry) => normalizeCustomerIdentifier(entry.creditorNumber) === number || (entry.dycosReferences?.creditorNumbers || []).some((candidate) => normalizeCustomerIdentifier(candidate) === number))
  const direct = matches.find((entry) => !entry.mergedIntoPartnerId && entry.status !== 'merged')
  return direct || matches.map((entry) => resolveActivePartner(partners, entry)).find(Boolean) || null
}

function publicRow(snapshot) { const data = snapshot.data(); return { id: snapshot.id, ...data } }

export async function listCustomerImportQueueHandler(request) {
  await access(request)
  const db = getFirestore(); const selectedRunId = text(request.data?.runId)
  const [open, accepted] = await Promise.all([db.collection('customerImportRows').where('state', '==', 'open').get(), db.collection('customerImportRows').where('state', '==', 'accepted').get()])
  const sort = (left, right) => (right.updatedAt?.toMillis?.() || 0) - (left.updatedAt?.toMillis?.() || 0)
  const allAccepted = accepted.docs.map(publicRow).sort(sort)
  const current = selectedRunId ? allAccepted.filter((row) => row.runId === selectedRunId) : []
  const partnerIds = [...new Set(allAccepted.map((row) => text(row.customerId || row.approval?.targetPartnerId || row.result?.partnerId)).filter(Boolean))]
  const runIds = [...new Set(allAccepted.map((row) => text(row.runId)).filter(Boolean))]
  const partners = new Map()
  for (let index = 0; index < partnerIds.length; index += 200) {
    const snapshots = await db.getAll(...partnerIds.slice(index, index + 200).map((id) => db.collection('businessPartners').doc(id)))
    snapshots.forEach((snapshot) => { if (snapshot.exists) partners.set(snapshot.id, { id: snapshot.id, companyName: snapshot.get('companyName') }) })
  }
  const runs = {}
  for (let index = 0; index < runIds.length; index += 200) {
    const snapshots = await db.getAll(...runIds.slice(index, index + 200).map((id) => db.collection('customerImportRuns').doc(id)))
    snapshots.forEach((snapshot) => { if (snapshot.exists) runs[snapshot.id] = { id: snapshot.id, fileName: snapshot.get('fileName'), importedAt: snapshot.get('importedAt'), importedByName: snapshot.get('importedByName') } })
  }
  const project = (row) => projectAcceptedCustomerImportRow(row, partners.get(text(row.customerId || row.approval?.targetPartnerId || row.result?.partnerId)))
  return { open: open.docs.map(publicRow).sort(sort), accepted: allAccepted.map(project), currentAccepted: current.map(project), runs }
}

function expired(lock) { return !lock?.expiresAt?.toMillis || lock.expiresAt.toMillis() <= Date.now() }
export function canClaimCustomerImportRow(row, userId) { return row?.state === 'open' && (!row.lock || row.lock.userId === userId || expired(row.lock)) }
export function canApproveCustomerImportRow(row, userId) { return row?.state === 'open' && row.lock?.userId === userId && !expired(row.lock) }
export const reviewedQueueRow = (row, approval) => ({ ...row, state: 'accepted', lock: null, approval })

function currentComparisonValue(customer, path) {
  return path === 'linkedCreditorNumber' ? customer.linkedCarrierReference?.creditorNumber : path === 'paymentTermDays' ? paymentTermText(customer) : readPath(customer, path)
}

function refreshComparisons(customer, comparisons) {
  return (comparisons || []).map((item) => comparison(item.path, currentComparisonValue(customer, item.path), item.incomingValue))
}

async function currentPartnerSnapshot(transaction, db, partnerId) {
  const snapshot = await transaction.get(db.collection('businessPartners').doc(partnerId))
  if (!snapshot.exists) throw new HttpsError('failed-precondition', 'Das zu prüfende Stammdatenblatt wurde nicht gefunden.')
  const targetId = text(snapshot.data().mergedIntoPartnerId)
  if (!targetId) return snapshot
  const target = await transaction.get(db.collection('businessPartners').doc(targetId))
  if (!target.exists || target.data().mergedIntoPartnerId || target.data().status === 'merged') throw new HttpsError('failed-precondition', 'Die Partner-Weiterleitung ist nicht eindeutig. Bitte die Stammdaten prüfen.')
  return target
}

export async function claimCustomerImportRowHandler(request) {
  const profile = await access(request); const runId = text(request.data?.runId); const rowId = text(request.data?.rowId); if (!runId || !rowId) throw new HttpsError('invalid-argument', 'Importlauf oder Prüfzeile fehlt.'); const db = getFirestore(); const rowRef = db.collection('customerImportRows').doc(rowId); const lock = { userId: request.auth.uid, userName: actorName(profile), expiresAt: Timestamp.fromMillis(Date.now() + lockDurationMs) }
  const row = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(rowRef)
    if (!snapshot.exists || snapshot.data().runId !== runId || snapshot.data().state !== 'open') throw new HttpsError('failed-precondition', 'Diese Prüfzeile ist nicht mehr offen.')
    const current = snapshot.data()
    if (!canClaimCustomerImportRow(current, request.auth.uid)) throw new HttpsError('failed-precondition', `Diese Prüfzeile wird bereits von ${current.lock?.userName || 'einem anderen Nutzer'} geprüft.`)
    let comparisons = current.comparisons || []
    let comparisonVersion = current.comparisonVersion || null
    let merge = current.merge || null
    if (current.kind === 'merge' && Array.isArray(current.merge?.partnerIds)) {
      if (!hasPartnerMergeAccess(profile)) throw new HttpsError('permission-denied', 'Für die Zusammenführung wird die Berechtigung „Partner zusammenführen“ benötigt.')
      const snapshots = await Promise.all(current.merge.partnerIds.map((partnerId) => transaction.get(db.collection('businessPartners').doc(partnerId))))
      merge = { ...current.merge, partners: snapshots.filter((entry) => entry.exists).map((entry) => {
        const item = partner(entry)
        return { ...partnerMergePreview(item), version: entry.updateTime.toMillis() }
      }) }
    }
    let customerId = current.customerId || null
    if (customerId && current.kind !== 'merge') {
      const customerSnapshot = await currentPartnerSnapshot(transaction, db, customerId)
      const customer = partner(customerSnapshot)
      customerId = customerSnapshot.id
      comparisons = refreshComparisons(customer, comparisons)
      comparisonVersion = { customerUpdatedAt: customer.updatedAt || null }
    }
    transaction.update(rowRef, { lock, customerId, ...(customerId !== current.customerId && !current.originalCustomerId ? { originalCustomerId: current.customerId } : {}), comparisons, comparisonVersion: { ...comparisonVersion, refreshedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() })
    return { id: snapshot.id, ...current, customerId, comparisons, comparisonVersion, merge, lock }
  })
  return { row }
}

export async function releaseCustomerImportRowHandler(request) {
  const profile = await access(request); const rowId = text(request.data?.rowId); if (!rowId) return { released: false }; const db = getFirestore(); const rowRef = db.collection('customerImportRows').doc(rowId); await db.runTransaction(async (transaction) => { const snapshot = await transaction.get(rowRef); if (snapshot.exists && snapshot.data().lock?.userId === request.auth.uid) transaction.update(rowRef, { lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }) }); return { released: true, by: actorName(profile) }
}

function normalizeApprovedValue(path, value) { if (path === 'creditNoteProcedure') return ['true', 'ja', '1'].includes(String(value).toLowerCase()); return text(value) }
function assignPath(target, path, value) { const parts = path.split('.'); if (parts.length === 1) { target[path] = value; return } target[parts[0]] = { ...(target[parts[0]] || {}), [parts[1]]: value } }

export async function approveCustomerImportRowHandler(request) {
  const profile = await access(request); const runId = text(request.data?.runId); const rowId = text(request.data?.rowId); const approvedValues = request.data?.approvedValues && typeof request.data.approvedValues === 'object' ? request.data.approvedValues : {}; if (!runId || !rowId) throw new HttpsError('invalid-argument', 'Importlauf oder Prüfzeile fehlt.'); const db = getFirestore(); const rowRef = db.collection('customerImportRows').doc(rowId)
  const result = await db.runTransaction(async (transaction) => { const rowSnapshot = await transaction.get(rowRef); if (!rowSnapshot.exists || rowSnapshot.data().runId !== runId || rowSnapshot.data().state !== 'open') throw new HttpsError('failed-precondition', 'Diese Prüfzeile wurde bereits bearbeitet.'); const row = rowSnapshot.data(); if (row.kind === 'merge') throw new HttpsError('failed-precondition', 'Diese Prüfzeile benötigt eine bewusste Partnerzusammenführung.'); if (row.kind === 'error' || !row.customerId) throw new HttpsError('failed-precondition', 'Fehlerhafte CSV-Zeilen können erst nach Korrektur in einer neuen Datei übernommen werden.'); if (!canApproveCustomerImportRow(row, request.auth.uid)) throw new HttpsError('failed-precondition', 'Die Prüfreservierung ist abgelaufen oder gehört einem anderen Nutzer.'); const customerSnapshot = await currentPartnerSnapshot(transaction, db, row.customerId); if (customerSnapshot.id !== row.customerId) throw new HttpsError('failed-precondition', 'Der Partner wurde inzwischen zusammengeführt. Bitte die Prüfzeile neu öffnen.'); const customerRef = customerSnapshot.ref; const partnerSnapshots = await transaction.get(db.collection('businessPartners')); const customer = partner(customerSnapshot); const partners = partnerSnapshots.docs.map(partner); const updates = {}
    for (const item of row.comparisons || []) {
      const path = item.path; const currentValue = currentComparisonValue(customer, path)
      if (!sameCustomerImportValue(path, currentValue, item.currentValue)) {
        throw new HttpsError('failed-precondition', `Der aktuelle Wert für ${item.label} wurde inzwischen geändert. Der Vergleich wird beim erneuten Öffnen aktualisiert.`)
      }
      const nextValue = normalizeApprovedValue(path, approvedValues[path] ?? item.incomingValue)
      if (path === 'linkedCreditorNumber') {
        const carrier = resolveCarrier(partners, nextValue)
        updates.linkedCarrierReference = linkedCarrierReference(nextValue, carrier)
      } else assignPath(updates, path, nextValue)
    }
    transaction.set(customerRef, { ...updates, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    transaction.set(customerRef.collection('history').doc(), { category: 'import', action: 'reviewed', summary: 'Kundenimport geprüft übernommen', source: 'dycosCustomerImport', importRunId: runId, metadata: { changes: businessPartnerHistoryChanges(customer, mergePartnerHistoryPatch(customer, updates)) }, actor: { userId: request.auth.uid, name: actorName(profile) }, previousValues: Object.fromEntries((row.comparisons || []).map((item) => [item.path, item.currentValue])), appliedValues: updates, createdAt: FieldValue.serverTimestamp() })
    const approval = { type: 'reviewed', at: FieldValue.serverTimestamp(), byUserId: request.auth.uid, byName: actorName(profile), previousValues: Object.fromEntries((row.comparisons || []).map((item) => [item.path, item.currentValue])), appliedValues: updates }
    const result = reviewedCustomerImportResult(row.result, customerRef.id, updates)
    const completed = reviewedQueueRow({ id: rowId, debtorNumber: row.debtorNumber, companyName: row.companyName }, approval)
    transaction.update(rowRef, { state: completed.state, approval, result, lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
    return { id: completed.id, debtorNumber: completed.debtorNumber, companyName: completed.companyName, approvalType: 'geprüft übernommen', customerId: customerRef.id, result, affectedPartner: { id: customerRef.id, companyName: updates.companyName || customer.companyName || '' } }
  })
  return { row: result }
}
