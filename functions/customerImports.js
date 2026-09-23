import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { customerImportActions, customerImportAssignment, projectAcceptedCustomerImportRow, reviewedCustomerImportResult } from './customerImportResults.js'
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
const importId = (number) => `dycos-debtor-${encodeURIComponent(number)}`
const empty = (value) => value === '' || value === null || value === undefined
export const normalizeCustomerIdentifier = (value) => empty(value) ? '' : String(value).trim()
export const customerReviewId = (debtorNumber) => `customer-review-${encodeURIComponent(normalizeCustomerIdentifier(debtorNumber))}`
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

function cleanRow(row, index) {
  const data = row?.data && typeof row.data === 'object' ? { ...row.data } : {}
  data.paymentTermDays = text(data.paymentTermsOriginal) || String(data.paymentTermDays ?? '').trim()
  return {
    rowNumber: Number(row?.rowNumber) || index + 2,
    debtorNumber: text(row?.debtorNumber),
    companyName: text(row?.companyName),
    data,
    errors: Array.isArray(row?.errors) ? row.errors.map(text).filter(Boolean) : [],
    warnings: Array.isArray(row?.warnings) ? row.warnings.map(text).filter(Boolean) : [],
  }
}

function partner(snapshot) {
  const data = snapshot.data()
  return { id: snapshot.id, ...data, address: data.address || {}, contact: data.contact || {}, companyData: data.companyData || {}, dycosReferences: data.dycosReferences || {}, contacts: data.contacts || [] }
}

export function customerPayload(row, runRef, now) {
  const data = row.data
  return {
    id: importId(row.debtorNumber), companyName: row.companyName, debtorNumber: row.debtorNumber, creditorNumber: normalizeCustomerIdentifier(data.linkedCreditorNumber), timocomNumber: '', transeuNumber: '', dplNumber: '', pakiNumber: '', status: 'active',
    paymentTermDays: text(data.paymentTermsOriginal) || String(data.paymentTermDays ?? '').trim(), paymentTermsOriginal: text(data.paymentTermsOriginal), creditNoteProcedure: Boolean(data.creditNoteProcedure), creditLimit: null, palletNote: '', crmStatus: '', potential: '', language: text(data.language), dycosCreatedAt: text(data.dycosCreatedAt),
    address: { street: text(data.street), houseNumber: '', postalCode: text(data.postalCode), city: text(data.city), country: text(data.country) },
    contact: { phone: '', fax: '', email: text(data.website).includes('@') ? text(data.website) : '', website: /^(?:https?:\/\/|www\.)/i.test(text(data.website)) ? text(data.website) : '' },
    contacts: data.contacts || [], portals: [], companyData: { vatId: text(data.vatId), taxNumber: text(data.taxNumber), commercialRegisterNumber: '', registerCourt: '' },
    dycosReferences: { debtorNumbers: [row.debtorNumber], creditorNumbers: normalizeCustomerIdentifier(data.linkedCreditorNumber) ? [normalizeCustomerIdentifier(data.linkedCreditorNumber)] : [] },
    importOrigin: { source: 'dycosCustomerImport', importRunId: runRef.id, createdAt: now }, importRawValues: data.rawValues || {}, createdAt: now, updatedAt: now,
  }
}

export function customerAdditions(existing, row) {
  const incoming = customerPayload(row, { id: 'preview' }, null)
  const patch = {}; const conflicts = []
  const set = (key, value) => { if (empty(value)) return; if (empty(existing[key])) patch[key] = value; else if (String(existing[key]) !== String(value)) conflicts.push(key) }
  const references = { ...(existing.dycosReferences || {}) }
  const addNumber = (field, referenceKey, value) => {
    const number = normalizeCustomerIdentifier(value)
    if (!number) return
    const primary = normalizeCustomerIdentifier(existing[field])
    const current = [...new Set((references[referenceKey] || []).map(normalizeCustomerIdentifier).filter(Boolean))]
    if (!primary) patch[field] = number
    else if (primary !== number && !current.includes(number)) references[referenceKey] = [...current, number]
  }
  set('companyName', incoming.companyName); set('language', incoming.language); set('dycosCreatedAt', incoming.dycosCreatedAt)
  addNumber('debtorNumber', 'debtorNumbers', incoming.debtorNumber)
  addNumber('creditorNumber', 'creditorNumbers', incoming.creditorNumber)
  if (incoming.paymentTermDays) {
    const currentTerm = paymentTermText(existing)
    if (!currentTerm || currentTerm === incoming.paymentTermDays) {
      if (existing.paymentTermDays !== incoming.paymentTermDays) patch.paymentTermDays = incoming.paymentTermDays
    } else conflicts.push('paymentTermDays')
  }
  if (incoming.paymentTermsOriginal && empty(existing.paymentTermsOriginal)) patch.paymentTermsOriginal = incoming.paymentTermsOriginal
  const nested = (key) => { const base = existing[key] || {}; const next = { ...base }; let changed = false; Object.entries(incoming[key] || {}).forEach(([field, value]) => { if (empty(value)) return; if (empty(base[field])) { next[field] = value; changed = true } else if (base[field] !== value) conflicts.push(`${key}.${field}`) }); if (changed) patch[key] = next }
  nested('address'); nested('contact'); nested('companyData')
  if (empty(existing.creditNoteProcedure)) patch.creditNoteProcedure = incoming.creditNoteProcedure
  else if (existing.creditNoteProcedure === false && incoming.creditNoteProcedure === true) conflicts.push('creditNoteProcedure')
  if (JSON.stringify(references) !== JSON.stringify(existing.dycosReferences || {})) patch.dycosReferences = references
  const contacts = [...(existing.contacts || [])]
  ;(incoming.contacts || []).forEach((entry) => { const index = contacts.findIndex((contact) => (entry.id && contact.id === entry.id) || (entry.email && text(contact.email).toLowerCase() === text(entry.email).toLowerCase())); if (index < 0) contacts.push(entry); else contacts[index] = Object.fromEntries(Object.entries({ ...entry, ...contacts[index] }).map(([key, value]) => [key, value || entry[key] || ''])) })
  if (JSON.stringify(contacts) !== JSON.stringify(existing.contacts || [])) patch.contacts = contacts
  return { patch, conflicts }
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

export function matchesDebtorReference(partner, debtorNumber) {
  const number = normalizeCustomerIdentifier(debtorNumber)
  return Boolean(number) && ([partner?.debtorNumber, ...(partner?.dycosReferences?.debtorNumbers || [])].some((candidate) => normalizeCustomerIdentifier(candidate) === number))
}

export function customerImportMergeCandidate(debtorPartner, creditorPartner) {
  if (!debtorPartner?.id || !creditorPartner?.id || debtorPartner.id === creditorPartner.id) return null
  return { partnerIds: [debtorPartner.id, creditorPartner.id], suggestedTargetId: debtorPartner.id, debtorPartnerId: debtorPartner.id, creditorPartnerId: creditorPartner.id }
}

export function customerImportDecisionDetails({ row, existing, payload, additions }) {
  const reasons = []; const comparisons = []; const addComparison = (item) => { if (!comparisons.some((current) => current.path === item.path)) comparisons.push(item) }
  additions?.conflicts.forEach((path) => addComparison(comparison(path, currentComparisonValue(existing, path), readPath(payload, path))))
  if (Array.isArray(row.data.unusualValues) && row.data.unusualValues.length) reasons.push('Ungewöhnliche Importwerte müssen geprüft werden.')
  return { reasons, comparisons }
}

async function findCustomers(numbers) {
  const db = getFirestore(); const snapshot = await db.collection('businessPartners').get(); const partners = snapshot.docs.map(partner); const map = new Map()
  partners.forEach((entry) => { numbers.forEach((number) => { if (!matchesDebtorReference(entry, number)) return; const active = resolveActivePartner(partners, entry); if (active && (!map.has(number) || (!entry.mergedIntoPartnerId && entry.status !== 'merged'))) map.set(number, active) }) })
  return { map, partners }
}

function queueRow(runRef, row, fields) {
  const existing = fields.existing || null
  return {
    id: fields.id, runId: runRef.id, fileName: fields.fileName, firstImportFileName: existing?.firstImportFileName || existing?.fileName || fields.fileName, lastImportFileName: fields.fileName,
    source: 'dycosCustomerImport', rowNumber: row.rowNumber, debtorNumber: row.debtorNumber, companyName: row.companyName,
    sourceRow: { debtorNumber: row.debtorNumber, companyName: row.companyName, data: row.data }, state: fields.state, kind: fields.kind, reasons: fields.reasons,
    comparisons: fields.comparisons, customerId: fields.customerId || null, merge: fields.merge || null, automaticAppliedValues: fields.automaticAppliedValues || {}, result: fields.result || null,
    createdAt: existing?.createdAt || FieldValue.serverTimestamp(), lastImportedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    ...(fields.clearExisting ? { lock: FieldValue.delete(), approval: FieldValue.delete() } : {}), ...(fields.approval ? { approval: fields.approval } : {}),
  }
}

const timestampMillis = (value) => value?.toMillis?.() || 0

async function openRowsForCustomer(db, debtorNumber) {
  const normalized = normalizeCustomerIdentifier(debtorNumber)
  if (!normalized) return []
  const snapshot = await db.collection('customerImportRows').where('state', '==', 'open').get()
  return snapshot.docs.filter((entry) => normalizeCustomerIdentifier(entry.data().debtorNumber) === normalized)
}

async function upsertOpenQueueRow(db, runRef, row, fields) {
  if (!row.debtorNumber) {
    const rowRef = db.collection('customerImportRows').doc()
    await rowRef.set(queueRow(runRef, row, { ...fields, id: rowRef.id }))
    return rowRef
  }
  const matching = await openRowsForCustomer(db, row.debtorNumber)
  const targetRef = db.collection('customerImportRows').doc(customerReviewId(row.debtorNumber))
  const targetSnapshot = matching.find((entry) => entry.id === targetRef.id)
  const latest = [...matching].sort((left, right) => timestampMillis(right.data().lastImportedAt || right.data().updatedAt || right.data().createdAt) - timestampMillis(left.data().lastImportedAt || left.data().updatedAt || left.data().createdAt))[0]
  const existing = targetSnapshot?.data() || latest?.data()
  await targetRef.set(queueRow(runRef, row, { ...fields, id: targetRef.id, existing, clearExisting: Boolean(targetSnapshot) }), { merge: true })
  await Promise.all(matching.filter((entry) => entry.id !== targetRef.id).map((entry) => entry.ref.update({ state: 'superseded', supersededBy: targetRef.id, supersededAt: FieldValue.serverTimestamp(), lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })))
  return targetRef
}

async function supersedeOpenQueueRows(db, debtorNumber, replacementId = null) {
  const matching = await openRowsForCustomer(db, debtorNumber)
  await Promise.all(matching.map((entry) => entry.ref.update({ state: 'superseded', ...(replacementId ? { supersededBy: replacementId } : {}), supersededAt: FieldValue.serverTimestamp(), lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })))
}

async function writePartnerHistory(customerRef, payload) { await customerRef.collection('history').doc().set({ ...payload, createdAt: FieldValue.serverTimestamp() }) }

export async function processCustomerImportHandler(request) {
  const profile = await access(request)
  const fileName = text(request.data?.fileName)
  const rows = Array.isArray(request.data?.rows) ? request.data.rows.map(cleanRow) : []
  if (!fileName || !rows.length) throw new HttpsError('invalid-argument', 'Keine CSV-Zeilen vorhanden.')
  const db = getFirestore(); const runRef = db.collection('customerImportRuns').doc(); const validNumbers = new Set(rows.filter((row) => row.debtorNumber).map((row) => normalizeCustomerIdentifier(row.debtorNumber))); const { map, partners } = await findCustomers(validNumbers)
  const seen = new Set(); const openIds = new Set(); const counts = { automaticallyAccepted: 0, open: 0, errors: 0 }; const accepted = []
  await runRef.set({ id: runRef.id, source: 'dycosCustomerImport', fileName, importedAt: FieldValue.serverTimestamp(), importedByUserId: request.auth.uid, importedByName: actorName(profile), status: 'processing' })
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]; row.debtorNumber = normalizeCustomerIdentifier(row.debtorNumber); const duplicate = row.debtorNumber && seen.has(row.debtorNumber); if (row.debtorNumber) seen.add(row.debtorNumber)
    const rowErrors = [...row.errors, ...(duplicate ? ['Kunden- nummer kommt in dieser Datei mehrfach vor.'] : []), ...(!row.debtorNumber ? ['Kunden- nummer: Pflichtwert fehlt.'] : []), ...(!row.companyName ? ['Firma: Pflichtwert fehlt.'] : [])]
    if (rowErrors.length) {
      const rowRef = await upsertOpenQueueRow(db, runRef, row, { fileName, state: 'open', kind: 'error', reasons: rowErrors, comparisons: [] })
      if (!openIds.has(rowRef.id)) { openIds.add(rowRef.id); counts.open += 1; counts.errors += 1 }
      continue
    }
    const debtorPartner = map.get(row.debtorNumber); const creditorPartner = resolveCarrier(partners, row.data.linkedCreditorNumber); const merge = customerImportMergeCandidate(debtorPartner, creditorPartner)
    if (merge) {
      const rowRef = await upsertOpenQueueRow(db, runRef, row, { fileName, state: 'open', kind: 'merge', reasons: ['Passendes separates Stammdatenblatt gefunden – Zusammenführung prüfen.'], comparisons: [], customerId: debtorPartner.id, merge })
      if (!openIds.has(rowRef.id)) { openIds.add(rowRef.id); counts.open += 1 }
      continue
    }
    const existing = debtorPartner || creditorPartner; const payload = customerPayload(row, runRef, FieldValue.serverTimestamp()); const additions = existing ? customerAdditions(existing, row) : { patch: {}, conflicts: [] }; const details = customerImportDecisionDetails({ row, existing, payload, additions }); const needsReview = details.reasons.length > 0 || details.comparisons.length > 0
    const assignment = customerImportAssignment(debtorPartner, creditorPartner, row.debtorNumber, row.data.linkedCreditorNumber)
    let customerId = existing?.id || payload.id; let automaticAppliedValues = {}
    if (!existing) { const customerRef = db.collection('businessPartners').doc(payload.id); await customerRef.set(payload); await writePartnerHistory(customerRef, { category: 'import', action: 'created', summary: 'Aus Kundenimport erstellt', source: 'dycosCustomerImport', importRunId: runRef.id }); map.set(row.debtorNumber, { id: payload.id, ...payload }); partners.push({ id: payload.id, ...payload }); automaticAppliedValues = { created: true } }
    else if (Object.keys(additions.patch).length) { const patch = { ...additions.patch }; if (Object.keys(patch).length) { const customerRef = db.collection('businessPartners').doc(existing.id); await customerRef.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); await writePartnerHistory(customerRef, { category: 'import', action: 'updated', summary: needsReview ? 'Sichere Felder aus Kundenimport ergänzt; Prüfung offen' : 'Aus Kundenimport ergänzt', source: 'dycosCustomerImport', importRunId: runRef.id, metadata: { fields: Object.keys(patch) } }); automaticAppliedValues = patch } }
    const result = { partnerId: customerId, assignment, actions: customerImportActions(existing, row, automaticAppliedValues) }
    if (needsReview) {
      const rowRef = await upsertOpenQueueRow(db, runRef, row, { fileName, state: 'open', kind: 'review', reasons: [...row.warnings, ...details.reasons], comparisons: details.comparisons, customerId, automaticAppliedValues, result })
      if (!openIds.has(rowRef.id)) { openIds.add(rowRef.id); counts.open += 1 }
      continue
    }
    await supersedeOpenQueueRows(db, row.debtorNumber)
    const rowRef = db.collection('customerImportRows').doc(); const approval = { type: 'automatic', at: FieldValue.serverTimestamp(), byUserId: request.auth.uid, byName: actorName(profile) }; await rowRef.set(queueRow(runRef, row, { id: rowRef.id, fileName, state: 'accepted', kind: 'automatic', reasons: [], comparisons: [], customerId, automaticAppliedValues, approval, result })); counts.automaticallyAccepted += 1; accepted.push({ id: rowRef.id, debtorNumber: row.debtorNumber, companyName: row.companyName, approvalType: 'automatisch übernommen', customerId, result })
  }
  await runRef.set({ status: 'completed', completedAt: FieldValue.serverTimestamp(), counts, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return { runId: runRef.id, counts, accepted }
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
    transaction.set(customerRef.collection('history').doc(), { category: 'import', action: 'reviewed', summary: 'Kundenimport geprüft übernommen', source: 'dycosCustomerImport', importRunId: runId, actor: { userId: request.auth.uid, name: actorName(profile) }, previousValues: Object.fromEntries((row.comparisons || []).map((item) => [item.path, item.currentValue])), appliedValues: updates, createdAt: FieldValue.serverTimestamp() })
    const approval = { type: 'reviewed', at: FieldValue.serverTimestamp(), byUserId: request.auth.uid, byName: actorName(profile), previousValues: Object.fromEntries((row.comparisons || []).map((item) => [item.path, item.currentValue])), appliedValues: updates }
    const result = reviewedCustomerImportResult(row.result, customerRef.id, updates)
    const completed = reviewedQueueRow({ id: rowId, debtorNumber: row.debtorNumber, companyName: row.companyName }, approval)
    transaction.update(rowRef, { state: completed.state, approval, result, lock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
    return { id: completed.id, debtorNumber: completed.debtorNumber, companyName: completed.companyName, approvalType: 'geprüft übernommen', customerId: customerRef.id, result, affectedPartner: { id: customerRef.id, companyName: updates.companyName || customer.companyName || '' } }
  })
  return { row: result }
}

// Kept for existing callers until the client migration is complete.
export async function previewCustomerImportHandler(request) { await access(request); return { existing: {} } }
export async function importCustomersHandler(request) { return processCustomerImportHandler(request) }
