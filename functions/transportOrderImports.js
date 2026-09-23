import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

const levels = { none: 0, view: 1, edit: 2 }
const text = (value) => typeof value === 'string' ? value.trim() : ''
const documentId = (externalNumber) => `dycos-${encodeURIComponent(externalNumber)}`
const database = () => getFirestore()
export const importPartnerId = (kind, value) => `dycos-${kind}-${encodeURIComponent(value)}`

function actorName(profile) { return [text(profile?.firstName), text(profile?.lastName)].filter(Boolean).join(' ') || text(profile?.email) || 'Unbekannt' }
function hasImportAccess(profile) { return profile?.role === 'superadmin' || levels[profile?.permissions?.dataImports] >= levels.edit }
async function assertImportAccess(request) {
  const profile = await requireActiveProfile(request)
  if (!hasImportAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Datenimporte.')
  return profile
}

function safeTree(value, label = 'Importdaten', depth = 0) {
  if (value === null) return null
  if (typeof value === 'string') {
    if (value.length > 4000) throw new HttpsError('invalid-argument', `${label} enthält einen zu langen Text.`)
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HttpsError('invalid-argument', `${label} enthält eine ungültige Zahl.`)
    return value
  }
  if (typeof value !== 'object' || Array.isArray(value) || depth > 6) throw new HttpsError('invalid-argument', `${label} ist ungültig.`)
  const entries = Object.entries(value)
  if (entries.length > 40) throw new HttpsError('invalid-argument', `${label} enthält zu viele Felder.`)
  return Object.fromEntries(entries.map(([key, child]) => {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) throw new HttpsError('invalid-argument', `${label} enthält einen ungültigen Feldnamen.`)
    return [key, safeTree(child, label, depth + 1)]
  }))
}

function validatedRow(value, index) {
  const rowNumber = Number(value?.rowNumber)
  const externalNumber = text(value?.externalNumber)
  const imported = safeTree(value?.imported, `Zeile ${index + 1}`)
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || !externalNumber || externalNumber.length > 120 || !imported || imported.externalNumber !== externalNumber) throw new HttpsError('invalid-argument', `Zeile ${index + 1} ist ungültig.`)
  if (!text(imported?.customer?.debtorNumber) || !text(imported?.customer?.name) || !text(imported?.carrier?.originalName)) throw new HttpsError('invalid-argument', `Zeile ${rowNumber} enthält nicht alle Pflichtwerte.`)
  return { rowNumber, externalNumber, imported }
}

function normalizePartnerName(value) {
  return text(value).toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function levenshtein(left, right) {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]; previous[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const temporary = previous[column]
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1))
      diagonal = temporary
    }
  }
  return previous[right.length]
}

export function carrierSimilarity(left, right) {
  const normalizedLeft = normalizePartnerName(left); const normalizedRight = normalizePartnerName(right)
  if (!normalizedLeft || !normalizedRight) return 0
  if (normalizedLeft === normalizedRight) return 1
  const distanceScore = 1 - (levenshtein(normalizedLeft, normalizedRight) / Math.max(normalizedLeft.length, normalizedRight.length))
  const leftWords = new Set(normalizedLeft.split(' ')); const rightWords = new Set(normalizedRight.split(' '))
  const commonWords = [...leftWords].filter((word) => rightWords.has(word)).length
  const wordScore = commonWords / Math.max(leftWords.size, rightWords.size)
  return Math.max(distanceScore, wordScore)
}

function partnerEntry(entry) {
  const data = entry.data()
  return { id: entry.id, companyName: text(data.companyName), debtorNumber: text(data.debtorNumber), creditorNumber: text(data.creditorNumber), dycosReferences: data.dycosReferences || {}, address: data.address || {}, contact: data.contact || {}, importOrigin: data.importOrigin || {}, taImportStatus: data.taImportStatus || {}, status: text(data.status), mergedIntoPartnerId: text(data.mergedIntoPartnerId) }
}

async function activePartnerFor(db, partner) {
  const visited = new Set()
  let current = partner
  while (current?.mergedIntoPartnerId) {
    if (visited.has(current.id)) return null
    visited.add(current.id)
    const target = await db.doc(`businessPartners/${current.mergedIntoPartnerId}`).get()
    current = target.exists ? partnerEntry(target) : null
  }
  return current?.status === 'merged' ? null : current
}

async function customersFor(numbers) {
  const db = database(); const result = new Map(); const directMatches = new Set(); const unique = [...new Set(numbers.filter(Boolean))]
  for (let index = 0; index < unique.length; index += 30) {
    const chunk = unique.slice(index, index + 30)
    const [primary, references] = await Promise.all([
      db.collection('businessPartners').where('debtorNumber', 'in', chunk).get(),
      db.collection('businessPartners').where('dycosReferences.debtorNumbers', 'array-contains-any', chunk).get(),
    ])
    for (const entry of primary.docs.concat(references.docs)) {
      const original = partnerEntry(entry)
      const partner = await activePartnerFor(db, original)
      if (!partner) continue
      const referenceNumbers = Array.isArray(original.dycosReferences?.debtorNumbers) ? original.dycosReferences.debtorNumbers.map(text) : []
      const allNumbers = [original.debtorNumber].concat(referenceNumbers)
      allNumbers.filter(Boolean).forEach((number) => { if (!chunk.includes(number)) return; const direct = original.id === partner.id; if (!result.has(number) || (direct && !directMatches.has(number))) result.set(number, partner); if (direct) directMatches.add(number) })
    }
  }
  return result
}

async function existingFor(numbers) {
  const db = database(); const result = new Map(); const unique = [...new Set(numbers.filter(Boolean))]
  for (let index = 0; index < unique.length; index += 200) {
    const snapshots = await db.getAll(...unique.slice(index, index + 200).map((number) => db.doc(`transportOrders/${documentId(number)}`)))
    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return
      const data = snapshot.data()
      result.set(text(data.externalNumber), { id: snapshot.id, importedFingerprint: text(data.importedFingerprint), customerPartnerId: text(data.imported?.customer?.partnerId), carrierPartnerId: text(data.imported?.carrier?.partnerId), importRunId: text(data.importMeta?.importRunId) })
    })
  }
  return result
}

async function carrierCandidatesFor(names) {
  const requested = [...new Set(names.map(text).filter(Boolean))]
  if (!requested.length) return new Map()
  const snapshot = await database().collection('businessPartners').get()
  const partners = snapshot.docs.map(partnerEntry).filter((partner) => partner.companyName && !partner.mergedIntoPartnerId && partner.status !== 'merged' && (!partner.debtorNumber || partner.creditorNumber || (partner.dycosReferences?.creditorNumbers || []).length))
  return new Map(requested.map((name) => [name, carrierMatchDecision(name, partners)]))
}

export function carrierMatchDecision(name, partners) {
  const candidates = partners.map((partner) => ({ partner, score: carrierSimilarity(name, partner.companyName) })).filter(({ score }) => score >= 0.6).sort((left, right) => right.score - left.score || left.partner.companyName.localeCompare(right.partner.companyName, 'de')).slice(0, 5)
  const exact = candidates.find(({ score }) => score === 1)
  return exact ? { kind: 'exact', partner: exact.partner, candidates: [] } : candidates.length ? { kind: 'candidates', candidates: candidates.map(({ partner, score }) => ({
    id: partner.id, companyName: partner.companyName, score: Math.round(score * 100),
    debtorNumbers: [...new Set([partner.debtorNumber, ...(Array.isArray(partner.dycosReferences?.debtorNumbers) ? partner.dycosReferences.debtorNumbers : [])].map(text).filter(Boolean))],
    creditorNumbers: [...new Set([partner.creditorNumber, ...(Array.isArray(partner.dycosReferences?.creditorNumbers) ? partner.dycosReferences.creditorNumbers : [])].map(text).filter(Boolean))],
    address: Object.fromEntries(['street', 'houseNumber', 'postalCode', 'city', 'country'].map((field) => [field, text(partner.address?.[field])])),
    contact: Object.fromEntries(['email', 'phone', 'website'].map((field) => [field, text(partner.contact?.[field])])),
  })) } : { kind: 'missing', candidates: [] }
}

function fingerprint(imported) { return JSON.stringify(imported) }
function classification(row, existing, carrierResolution) {
  const needsReview = carrierResolution?.kind === 'candidates' && !carrierResolution?.selected
  if (!existing) return { status: needsReview ? 'review' : 'new', reasons: needsReview ? ['Unternehmerzuordnung auswählen oder Neuanlage bestätigen.'] : [] }
  const unchanged = existing.importedFingerprint === fingerprint(row.imported) && Boolean(existing.customerPartnerId) && Boolean(existing.carrierPartnerId)
  return { status: needsReview ? 'review' : unchanged ? 'unchanged' : 'updated', reasons: needsReview ? ['Unternehmerzuordnung auswählen oder Neuanlage bestätigen.'] : [] }
}
function resultStatus(status) { return status === 'review' ? 'Prüfung erforderlich' : status === 'new' ? 'Neu' : status === 'updated' ? 'Aktualisiert' : 'Unverändert' }

function previewRows(value) {
  if (!Array.isArray(value) || value.length > 5000) throw new HttpsError('invalid-argument', 'Ungültige Importvorschau.')
  return value.map((entry, index) => {
    const externalNumber = text(entry?.externalNumber); const debtorNumber = text(entry?.customer?.debtorNumber); const carrierName = text(entry?.carrier?.originalName)
    if (!externalNumber || !debtorNumber || !carrierName) throw new HttpsError('invalid-argument', `Vorschauzeile ${index + 1} ist unvollständig.`)
    return { externalNumber, debtorNumber, carrierName }
  })
}

export function customerPartnerPayload(row, { partnerId, importRunId, now }) {
  const customer = row.imported.customer; const email = text(row.imported.contacts?.customerStandardEmail)
  return {
    id: partnerId, companyName: customer.name, debtorNumber: customer.debtorNumber, creditorNumber: '', timocomNumber: '', transeuNumber: '', dplNumber: '', pakiNumber: '', status: 'active', paymentTermDays: '', creditNoteProcedure: false, creditLimit: null, palletNote: '', crmStatus: '', potential: '',
    address: { street: text(customer.snapshot?.street), houseNumber: '', postalCode: text(customer.snapshot?.postalCode), city: text(customer.snapshot?.city), country: text(customer.snapshot?.country) },
    contact: { phone: '', fax: '', email, website: '' }, contacts: [], portals: [], companyData: { vatId: '', taxNumber: '', commercialRegisterNumber: '', registerCourt: '' },
    dycosReferences: { debtorNumbers: [customer.debtorNumber], creditorNumbers: [] },
    importOrigin: { source: 'dycosTransportOrder', transportOrderNumber: row.externalNumber, importRunId, createdAt: now }, createdAt: now, updatedAt: now,
  }
}

export function carrierPartnerPayload(row, { partnerId, importRunId, now }) {
  const email = text(row.imported.contacts?.carrierStandardEmail)
  return {
    id: partnerId, companyName: row.imported.carrier.originalName, debtorNumber: '', creditorNumber: '', timocomNumber: '', transeuNumber: '', dplNumber: '', pakiNumber: '', status: 'active', paymentTermDays: '', creditNoteProcedure: false, creditLimit: null, palletNote: '', crmStatus: '', potential: '',
    address: { street: '', houseNumber: '', postalCode: '', city: '', country: '' }, contact: { phone: '', fax: '', email, website: '' }, contacts: [], portals: [], companyData: { vatId: '', taxNumber: '', commercialRegisterNumber: '', registerCourt: '' },
    dycosReferences: { debtorNumbers: [], creditorNumbers: [] },
    importOrigin: { source: 'dycosTransportOrder', transportOrderNumber: row.externalNumber, importRunId, createdAt: now },
    taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'], transportOrderNumber: row.externalNumber, importRunId, importedAt: now, partnerId },
    createdAt: now, updatedAt: now,
  }
}

export function fillEmptyCustomerFields(partner, row) {
  const customer = row.imported.customer; const incomingEmail = text(row.imported.contacts?.customerStandardEmail); const currentAddress = partner.address || {}; const currentContact = partner.contact || {}
  const address = { ...currentAddress }
  for (const [field, value] of Object.entries({ street: text(customer.snapshot?.street), postalCode: text(customer.snapshot?.postalCode), city: text(customer.snapshot?.city), country: text(customer.snapshot?.country) })) if (!text(address[field]) && value) address[field] = value
  const contact = !text(currentContact.email) && incomingEmail ? { ...currentContact, email: incomingEmail } : currentContact
  const patch = {}
  if (!text(partner.companyName) && customer.name) patch.companyName = customer.name
  if (JSON.stringify(address) !== JSON.stringify(currentAddress)) patch.address = address
  if (JSON.stringify(contact) !== JSON.stringify(currentContact)) patch.contact = contact
  return patch
}

function importHistoryPayload(row, runRef, now) {
  return { category: 'import', action: 'created', summary: 'Aus TA-Import erstellt', source: 'dycosTransportOrder', transportOrderNumber: row.externalNumber, importRunId: runRef.id, createdAt: now }
}

function carrierNeedsCreditorNotice(partner) {
  return !text(partner?.creditorNumber) && (partner?.taImportStatus?.source === 'dycosTransportOrder' || partner?.importOrigin?.source === 'dycosTransportOrder')
}

function carrierImportStatus(partner, row, runRef, now) {
  const origin = partner?.importOrigin || {}
  const existing = partner?.taImportStatus || {}
  return {
    source: 'dycosTransportOrder',
    missingRequiredFields: ['creditorNumber'],
    transportOrderNumber: text(existing.transportOrderNumber) || text(origin.transportOrderNumber) || row.externalNumber,
    importRunId: text(existing.importRunId) || text(origin.importRunId) || runRef.id,
    importedAt: existing.importedAt || origin.createdAt || now,
    partnerId: partner.id,
  }
}

export function transportOrderPartnerLink(partner) {
  if (!text(partner?.id)) throw new HttpsError('failed-precondition', 'Partner besitzt keine Firestore-Dokument-ID.')
  const link = {
    partnerId: partner.id,
    partnerName: partner.companyName,
  }
  if (carrierNeedsCreditorNotice(partner)) link.masterDataStatus = 'creditorNumberMissing'
  return link
}

export function isSafeImportedCarrierRepair(existingOrder, partner, externalNumber) {
  return Boolean(
    existingOrder?.carrierPartnerId
      && partner?.id
      && text(partner?.importOrigin?.source) === 'dycosTransportOrder'
      && text(partner?.importOrigin?.transportOrderNumber) === text(externalNumber)
      && !text(partner?.creditorNumber),
  )
}

async function ensureCustomer(db, batch, row, knownCustomers, runRef, now) {
  const number = row.imported.customer.debtorNumber; let customer = knownCustomers.get(number)
  if (!customer) {
    const ref = db.doc(`businessPartners/${importPartnerId('debtor', number)}`); const existing = await ref.get()
    if (existing.exists) customer = partnerEntry(existing)
    else {
      const payload = customerPartnerPayload(row, { partnerId: ref.id, importRunId: runRef.id, now })
      batch.set(ref, payload)
      batch.set(ref.collection('history').doc(), importHistoryPayload(row, runRef, now))
      customer = { id: ref.id, companyName: payload.companyName, debtorNumber: number, address: payload.address, contact: payload.contact, dycosReferences: payload.dycosReferences }
    }
    knownCustomers.set(number, customer)
  }
  const patch = fillEmptyCustomerFields(customer, row)
  if (Object.keys(patch).length) { batch.set(db.doc(`businessPartners/${customer.id}`), { ...patch, updatedAt: now }, { merge: true }); customer = { ...customer, ...patch }; knownCustomers.set(number, customer) }
  return customer
}

function resolutions(value) {
  if (!Array.isArray(value) || value.length > 5000) return new Map()
  return new Map(value.map((entry) => [text(entry?.externalNumber), { partnerId: text(entry?.partnerId), createNew: entry?.createNew === true }]).filter(([number]) => number))
}

export function carrierResolutionForImport(match, chosen) {
  if (chosen) {
    if (match?.kind !== 'candidates') throw new HttpsError('failed-precondition', 'Die Unternehmerauswahl ist nicht mehr aktuell. Bitte die Vorschau neu laden.')
    if (chosen.createNew && !chosen.partnerId) return { createNew: true, manual: true }
    if (chosen.partnerId && !chosen.createNew && match.candidates.some((candidate) => candidate.id === chosen.partnerId)) return { partnerId: chosen.partnerId, manual: true }
    throw new HttpsError('invalid-argument', 'Bitte einen vorgeschlagenen Unternehmer oder eine Neuanlage auswählen.')
  }
  return match?.kind === 'exact' ? { partnerId: match.partner.id } : match?.kind === 'missing' ? { createNew: true } : null
}

async function repairImportedCarrier(db, row, existingOrder) {
  if (!existingOrder?.carrierPartnerId) return null
  const expected = await db.doc(`businessPartners/${importPartnerId('carrier', normalizePartnerName(row.imported.carrier.originalName))}`).get()
  if (!expected.exists) return null
  const original = partnerEntry(expected)
  return isSafeImportedCarrierRepair(existingOrder, original, row.externalNumber) ? activePartnerFor(db, original) : null
}

async function ensureCarrier(db, batch, row, knownCarriers, existingOrder, resolution, runRef, now) {
  const name = row.imported.carrier.originalName; const normalized = normalizePartnerName(name)
  if (resolution?.manual && resolution.partnerId) {
    const selected = await db.doc(`businessPartners/${resolution.partnerId}`).get()
    if (!selected.exists) throw new HttpsError('not-found', `Der gewählte Unternehmer für TA ${row.externalNumber} wurde nicht gefunden.`)
    const partner = partnerEntry(selected)
    if (partner.mergedIntoPartnerId || partner.status === 'merged') throw new HttpsError('failed-precondition', `Der gewählte Unternehmer für TA ${row.externalNumber} wurde inzwischen zusammengeführt. Bitte die Vorschau neu laden.`)
    return partner
  }
  if (!resolution?.manual && existingOrder?.carrierPartnerId) {
    const existing = await db.doc(`businessPartners/${existingOrder.carrierPartnerId}`).get()
    if (existing.exists) {
      const partner = await activePartnerFor(db, partnerEntry(existing))
      if (!partner) throw new HttpsError('failed-precondition', `Der bisherige Unternehmer für TA ${row.externalNumber} ist archiviert, aber sein Zielpartner fehlt. Bitte die Zuordnung prüfen.`)
      if (carrierNeedsCreditorNotice(partner) && !partner.taImportStatus?.missingRequiredFields?.includes('creditorNumber')) batch.set(db.doc(`businessPartners/${partner.id}`), { taImportStatus: carrierImportStatus(partner, row, runRef, now), updatedAt: now }, { merge: true })
      return partner
    }
  }
  if (resolution?.partnerId) {
    const selected = await db.doc(`businessPartners/${resolution.partnerId}`).get()
    if (!selected.exists) throw new HttpsError('not-found', `Der gewählte Unternehmer für TA ${row.externalNumber} wurde nicht gefunden.`)
    const partner = await activePartnerFor(db, partnerEntry(selected))
    if (!partner) throw new HttpsError('failed-precondition', `Der gewählte Unternehmer für TA ${row.externalNumber} ist archiviert, aber sein Zielpartner fehlt.`)
    return partner
  }
  const repaired = resolution?.manual ? null : await repairImportedCarrier(db, row, existingOrder)
  if (repaired) {
    if (!repaired.taImportStatus?.missingRequiredFields?.includes('creditorNumber')) batch.set(db.doc(`businessPartners/${repaired.id}`), { taImportStatus: carrierImportStatus(repaired, row, runRef, now), updatedAt: now }, { merge: true })
    knownCarriers.set(normalized, repaired)
    return repaired
  }
  if (knownCarriers.has(normalized)) return knownCarriers.get(normalized)
  if (!resolution?.createNew) throw new HttpsError('failed-precondition', `Für Unternehmer ${name} muss eine Zuordnung oder Neuanlage bestätigt werden.`)
  const ref = db.doc(`businessPartners/${importPartnerId('carrier', normalized)}`); const existing = await ref.get()
  if (existing.exists) { const partner = partnerEntry(existing); knownCarriers.set(normalized, partner); return partner }
  const payload = carrierPartnerPayload(row, { partnerId: ref.id, importRunId: runRef.id, now })
  batch.set(ref, payload)
  batch.set(ref.collection('history').doc(), importHistoryPayload(row, runRef, now))
  const partner = { id: ref.id, companyName: payload.companyName, creditorNumber: '', address: payload.address, contact: payload.contact, dycosReferences: payload.dycosReferences, importOrigin: payload.importOrigin, taImportStatus: payload.taImportStatus }
  knownCarriers.set(normalized, partner)
  return partner
}

export async function previewTransportOrderImportHandler(request) {
  await assertImportAccess(request)
  const rows = previewRows(request.data?.rows)
  const [existing, customers, carrierMatches] = await Promise.all([existingFor(rows.map((row) => row.externalNumber)), customersFor(rows.map((row) => row.debtorNumber)), carrierCandidatesFor(rows.map((row) => row.carrierName))])
  return {
    existing: Object.fromEntries([...existing.entries()].map(([number, value]) => [number, value.importedFingerprint])),
    customers: Object.fromEntries([...customers.entries()].map(([number, value]) => [number, { id: value.id, companyName: value.companyName }])),
    carriers: Object.fromEntries(rows.map((row) => {
      const match = carrierMatches.get(row.carrierName)
      return [row.externalNumber, match?.kind === 'exact' ? { kind: 'exact', partner: { id: match.partner.id, companyName: match.partner.companyName }, candidates: [] } : match]
    })),
  }
}

export async function importTransportOrdersHandler(request) {
  const profile = await assertImportAccess(request); const db = database(); const fileName = text(request.data?.fileName)
  const rows = Array.isArray(request.data?.rows) ? request.data.rows.map(validatedRow) : []
  if (!fileName || fileName.length > 240 || !rows.length || rows.length > 5000) throw new HttpsError('invalid-argument', 'Bitte eine gültige CSV-Vorschau mit höchstens 5.000 importierbaren Zeilen übergeben.')
  const numbers = new Set(); rows.forEach((row) => { if (numbers.has(row.externalNumber)) throw new HttpsError('invalid-argument', `Die TA-Nummer ${row.externalNumber} kommt mehrfach vor.`); numbers.add(row.externalNumber) })
  const rowErrors = Array.isArray(request.data?.rowErrors) ? request.data.rowErrors.slice(0, 5000).map((entry) => ({ rowNumber: Number(entry?.rowNumber) || null, errors: Array.isArray(entry?.errors) ? entry.errors.map(text).filter(Boolean).slice(0, 10) : [] })) : []
  const [existing, customers, matches] = await Promise.all([existingFor(rows.map((row) => row.externalNumber)), customersFor(rows.map((row) => row.imported.customer.debtorNumber)), carrierCandidatesFor(rows.map((row) => row.imported.carrier.originalName))])
  const selected = resolutions(request.data?.carrierResolutions); const runRef = db.collection('transportOrderImportRuns').doc(); const counts = { new: 0, updated: 0, unchanged: 0, review: 0, failed: rowErrors.length }; const results = []; const now = FieldValue.serverTimestamp(); const importedBy = actorName(profile); const knownCarriers = new Map()

  for (const row of rows) {
    const existingOrder = existing.get(row.externalNumber); const match = matches.get(row.imported.carrier.originalName); const resolution = carrierResolutionForImport(match, selected.get(row.externalNumber))
    const carrierResolution = { kind: match?.kind, selected: Boolean(resolution?.partnerId || resolution?.createNew) }
    const decision = classification(row, existingOrder, carrierResolution)
    if (decision.status === 'review') throw new HttpsError('failed-precondition', `TA ${row.externalNumber}: ${decision.reasons[0]}`)
    const batch = db.batch()
    const customer = await ensureCustomer(db, batch, row, customers, runRef, now)
    const carrier = await ensureCarrier(db, batch, row, knownCarriers, existingOrder, resolution, runRef, now)
    const originalCustomer = existingOrder?.customerPartnerId ? await db.doc(`businessPartners/${existingOrder.customerPartnerId}`).get() : null
    const originalCarrier = !resolution?.manual && existingOrder?.carrierPartnerId ? await db.doc(`businessPartners/${existingOrder.carrierPartnerId}`).get() : null
    const customerPartnerId = originalCustomer?.exists ? originalCustomer.id : customer.id
    const carrierPartnerId = originalCarrier?.exists ? originalCarrier.id : carrier.id
    const importStatus = decision.status === 'unchanged' && (existingOrder?.customerPartnerId !== customerPartnerId || existingOrder?.carrierPartnerId !== carrierPartnerId) ? 'updated' : decision.status
    counts[importStatus] += 1
    const imported = { ...row.imported, customer: { ...row.imported.customer, ...transportOrderPartnerLink(customer), partnerId: customerPartnerId }, carrier: { ...row.imported.carrier, ...transportOrderPartnerLink(carrier), partnerId: carrierPartnerId, matchStatus: resolution?.createNew ? 'created' : 'linked' } }
    const ref = db.doc(`transportOrders/${documentId(row.externalNumber)}`)
    batch.set(ref, { id: ref.id, externalNumber: row.externalNumber, source: 'dycos', imported, importedFingerprint: fingerprint(row.imported), importMeta: { source: 'dycos', ...(existingOrder ? {} : { importedAt: now }), lastImportedAt: now, importRunId: runRef.id, fileName }, ...(existingOrder ? { updatedAt: now, updatedBy: request.auth.uid, updatedByName: importedBy } : { manual: {}, tracking: {}, createdAt: now, createdBy: request.auth.uid, createdByName: importedBy, updatedAt: now, updatedBy: request.auth.uid, updatedByName: importedBy }) }, { merge: true })
    await batch.commit()
    results.push({ rowNumber: row.rowNumber, externalNumber: row.externalNumber, status: resultStatus(importStatus), reasons: decision.reasons })
  }
  await runRef.set({ id: runRef.id, source: 'dycos', fileName, importedAt: now, importedByUserId: request.auth.uid, importedByName: importedBy, counts: { Neu: counts.new, Aktualisiert: counts.updated, Unverändert: counts.unchanged, 'Prüfung erforderlich': counts.review, Fehlerhaft: counts.failed }, rowErrors })
  return { runId: runRef.id, counts: { Neu: counts.new, Aktualisiert: counts.updated, Unverändert: counts.unchanged, 'Prüfung erforderlich': counts.review, Fehlerhaft: counts.failed }, results }
}
