import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { canApproveCustomerImportRow, canClaimCustomerImportRow, normalizeCustomerIdentifier } from './customerImports.js'
import { projectAcceptedCustomerImportRow, reviewedCustomerImportResult } from './customerImportResults.js'
import { hasPartnerMergeAccess } from './partnerMerges.js'
import { partnerMergePreview } from './partnerMergeDecisions.js'
import { carrierActions, carrierAdditions, carrierDecisionDetails, carrierIdentity, carrierPayload, carrierReadPath, carrierReviewId, hasCarrierImportAccess, sameCarrierValue } from './carrierImportModel.js'

const text = (value) => value === null || value === undefined ? '' : String(value).trim()
const actorName = (profile) => [text(profile?.firstName), text(profile?.lastName)].filter(Boolean).join(' ') || text(profile?.email) || 'Unbekannt'
const lockDurationMs = 5 * 60 * 1000
const rowCollection = 'carrierImportRows'
const runCollection = 'carrierImportRuns'
const identity = (row) => normalizeCustomerIdentifier(row.creditorNumber)

async function access(request) {
  const profile = await requireActiveProfile(request)
  if (!hasCarrierImportAccess(profile)) throw new HttpsError('permission-denied', 'Für Unternehmerimporte werden Datenimport- und Stammdaten-Bearbeitungsrechte benötigt.')
  return profile
}

const partner = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })
const publicRow = (snapshot) => ({ id: snapshot.id, ...snapshot.data() })
const millis = (value) => value?.toMillis?.() || 0
const safeDataKeys = new Set(['linkedDebtorNumber', 'street', 'postalCode', 'city', 'country', 'vatId', 'taxNumber', 'internet', 'website', 'paymentTermsOriginal', 'paymentTermDays', 'iban', 'bic', 'ibanVerifiedAt', 'dycosCreatedAt', 'timocomNumber', 'contacts', 'rawValues'])
function cleanRow(row, index) {
  const source = row?.data && typeof row.data === 'object' ? row.data : {}
  const data = Object.fromEntries(Object.entries(source).filter(([key]) => safeDataKeys.has(key)))
  if (data.rawValues && typeof data.rawValues === 'object') { data.rawValues = { ...data.rawValues }; delete data.rawValues.infos }
  data.contacts = Array.isArray(data.contacts) ? data.contacts.slice(0, 50).map((entry, contactIndex) => ({ id: text(entry?.id) || `dycos-carrier-${contactIndex + 1}`, name: text(entry?.name), department: text(entry?.department), phone: text(entry?.phone), mobile: text(entry?.mobile), email: text(entry?.email).toLowerCase() })) : []
  data.paymentTermDays = text(data.paymentTermsOriginal || data.paymentTermDays)
  return { rowNumber: Number(row?.rowNumber) || index + 2, creditorNumber: identity(row), companyName: text(row?.companyName), data, errors: Array.isArray(row?.errors) ? row.errors.map(text).filter(Boolean) : [], warnings: Array.isArray(row?.warnings) ? row.warnings.map(text).filter(Boolean) : [] }
}

function queueData(runRef, row, fields) {
  const previous = fields.previous || null
  return { id: fields.id, runId: runRef.id, fileName: fields.fileName, firstImportFileName: previous?.firstImportFileName || previous?.fileName || fields.fileName, lastImportFileName: fields.fileName,
    source: 'dycosCarrierImport', rowNumber: row.rowNumber, creditorNumber: row.creditorNumber, companyName: row.companyName,
    sourceRow: { creditorNumber: row.creditorNumber, companyName: row.companyName, data: row.data }, state: fields.state, kind: fields.kind, reasons: fields.reasons || [],
    comparisons: fields.comparisons || [], carrierId: fields.carrierId || null, merge: fields.merge || null, automaticAppliedValues: fields.automaticAppliedValues || {}, result: fields.result || null,
    createdAt: previous?.createdAt || FieldValue.serverTimestamp(), lastImportedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    ...(fields.clearLock ? { lock: FieldValue.delete(), approval: FieldValue.delete() } : {}), ...(fields.approval ? { approval: fields.approval } : {}) }
}

async function openRowsFor(db, creditorNumber) {
  if (!creditorNumber) return []
  const snapshot = await db.collection(rowCollection).where('state', '==', 'open').get()
  return snapshot.docs.filter((entry) => identity(entry.data()) === creditorNumber)
}

async function upsertOpen(db, runRef, row, fields) {
  const matching = await openRowsFor(db, row.creditorNumber)
  const preferred = row.creditorNumber ? db.collection(rowCollection).doc(carrierReviewId(row.creditorNumber)) : null
  const currentPreferred = preferred ? await preferred.get() : null
  const latest = [...matching].sort((a, b) => millis(b.data().lastImportedAt) - millis(a.data().lastImportedAt))[0]
  const ref = matching.find((entry) => entry.id === preferred?.id)?.ref || latest?.ref || (currentPreferred?.exists ? db.collection(rowCollection).doc() : preferred || db.collection(rowCollection).doc())
  const previous = matching.find((entry) => entry.id === ref.id)?.data() || latest?.data()
  await ref.set(queueData(runRef, row, { ...fields, id: ref.id, previous, clearLock: true }), { merge: true })
  await Promise.all(matching.filter((entry) => entry.id !== ref.id).map((entry) => entry.ref.update({ state: 'superseded', supersededBy: ref.id, lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })))
  return ref.id
}

async function supersedeOpen(db, number) {
  const matching = await openRowsFor(db, number)
  await Promise.all(matching.map((entry) => entry.ref.update({ state: 'superseded', lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })))
}

export async function processCarrierImportHandler(request) {
  const profile = await access(request)
  const fileName = text(request.data?.fileName)
  const rows = Array.isArray(request.data?.rows) ? request.data.rows.map(cleanRow) : []
  if (!fileName || !rows.length) throw new HttpsError('invalid-argument', 'Keine Unternehmer-CSV-Zeilen vorhanden.')
  const db = getFirestore(); const runRef = db.collection(runCollection).doc()
  const snapshots = await db.collection('businessPartners').get(); const partners = snapshots.docs.map(partner)
  const seen = new Set(); const openIds = new Set(); const counts = { automaticallyAccepted: 0, open: 0, errors: 0 }; const accepted = []
  await runRef.set({ id: runRef.id, source: 'dycosCarrierImport', fileName, importedAt: FieldValue.serverTimestamp(), importedByUserId: request.auth.uid, importedByName: actorName(profile), status: 'processing' })
  for (const row of rows) {
    const duplicate = Boolean(row.creditorNumber && seen.has(row.creditorNumber)); if (row.creditorNumber) seen.add(row.creditorNumber)
    const errors = [...row.errors, ...(!row.creditorNumber ? ['Kreditorennummer: Pflichtwert fehlt.'] : []), ...(!row.companyName ? ['Unternehmer: Pflichtwert fehlt.'] : []), ...(duplicate ? ['Kreditorennummer kommt in dieser Datei mehrfach vor.'] : [])]
    if (errors.length) {
      const id = await upsertOpen(db, runRef, row, { fileName, state: 'open', kind: 'error', reasons: [...new Set(errors)] })
      if (!openIds.has(id)) { openIds.add(id); counts.open += 1; counts.errors += 1 }
      continue
    }
    const found = carrierIdentity(partners, row.creditorNumber, row.data.linkedDebtorNumber)
    if (found.ambiguity) {
      const id = await upsertOpen(db, runRef, row, { fileName, state: 'open', kind: 'error', reasons: [found.ambiguity] })
      if (!openIds.has(id)) { openIds.add(id); counts.open += 1; counts.errors += 1 }
      continue
    }
    if (found.merge) {
      const id = await upsertOpen(db, runRef, row, { fileName, state: 'open', kind: 'merge', reasons: ['Passendes separates Stammdatenblatt gefunden – Zusammenführung prüfen.'], carrierId: found.creditor.id, merge: found.merge })
      if (!openIds.has(id)) { openIds.add(id); counts.open += 1 }
      continue
    }
    const existing = found.partner
    const existingBefore = existing ? { creditorNumber: existing.creditorNumber, debtorNumber: existing.debtorNumber, dycosReferences: { ...(existing.dycosReferences || {}) } } : null
    const payload = carrierPayload(row, runRef.id, FieldValue.serverTimestamp())
    const additions = existing ? carrierAdditions(existing, row) : { patch: {}, conflicts: [] }
    const details = carrierDecisionDetails(row, additions, existing)
    const needsReview = details.comparisons.length > 0 || details.reasons.length > 0
    let carrierId = existing?.id || payload.id; let automaticAppliedValues = {}
    if (!existing) {
      const ref = db.collection('businessPartners').doc(payload.id)
      const collision = await ref.get()
      if (collision.exists) carrierId = db.collection('businessPartners').doc().id
      const actualRef = db.collection('businessPartners').doc(carrierId)
      await actualRef.set({ ...payload, id: carrierId })
      await actualRef.collection('history').doc().set({ category: 'import', action: 'created', summary: 'Aus Unternehmerimport erstellt', source: 'dycosCarrierImport', importRunId: runRef.id, createdAt: FieldValue.serverTimestamp() })
      partners.push({ ...payload, id: carrierId }); automaticAppliedValues = { created: true }
    } else if (Object.keys(additions.patch).length) {
      const ref = db.collection('businessPartners').doc(existing.id)
      await ref.set({ ...additions.patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      await ref.collection('history').doc().set({ category: 'import', action: 'updated', summary: needsReview ? 'Sichere Felder aus Unternehmerimport ergänzt; Prüfung offen' : 'Aus Unternehmerimport ergänzt', source: 'dycosCarrierImport', importRunId: runRef.id, metadata: { fields: Object.keys(additions.patch) }, createdAt: FieldValue.serverTimestamp() })
      Object.assign(existing, additions.patch); automaticAppliedValues = additions.patch
    }
    const result = { partnerId: carrierId, assignment: found.assignment, actions: carrierActions(existingBefore, row, automaticAppliedValues) }
    if (needsReview) {
      const id = await upsertOpen(db, runRef, row, { fileName, state: 'open', kind: 'review', reasons: [...row.warnings, ...details.reasons], comparisons: details.comparisons, carrierId, automaticAppliedValues, result })
      if (!openIds.has(id)) { openIds.add(id); counts.open += 1 }
      continue
    }
    await supersedeOpen(db, row.creditorNumber)
    const ref = db.collection(rowCollection).doc()
    const approval = { type: 'automatic', at: FieldValue.serverTimestamp(), byUserId: request.auth.uid, byName: actorName(profile) }
    await ref.set(queueData(runRef, row, { id: ref.id, fileName, state: 'accepted', kind: 'automatic', carrierId, automaticAppliedValues, approval, result }))
    counts.automaticallyAccepted += 1; accepted.push({ id: ref.id, creditorNumber: row.creditorNumber, companyName: row.companyName, carrierId, result })
  }
  await runRef.set({ status: 'completed', completedAt: FieldValue.serverTimestamp(), counts, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return { runId: runRef.id, counts, accepted }
}

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
    transaction.set(carrierRef.collection('history').doc(), { category: 'import', action: 'reviewed', summary: 'Unternehmerimport geprüft übernommen', source: 'dycosCarrierImport', importRunId: runId, actor: { userId: request.auth.uid, name: actorName(profile) }, previousValues: approval.previousValues, appliedValues: updates, createdAt: FieldValue.serverTimestamp() })
    const reviewed = reviewedCustomerImportResult(row.result, carrierRef.id, updates)
    transaction.update(rowRef, { state: 'accepted', result: reviewed, approval, lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
    return { id: rowId, creditorNumber: row.creditorNumber, companyName: row.companyName, approvalType: 'geprüft übernommen', carrierId: carrierRef.id, result: reviewed, affectedPartner: { id: carrierRef.id, companyName: updates.companyName || carrier.companyName || '' } }
  })
  return { row: result }
}
