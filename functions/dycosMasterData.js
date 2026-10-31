import { createHash, randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { fetchDycosFlowPartner } from './dycosFlowClient.js'
import { dycosPartnerAdditions, dycosPartnerReviewFingerprint, hasDycosMasterDataAccess, mapDycosPartnerData } from './dycosPartnerData.js'
import { resolvePartner } from './dycosTransportOrders.js'
import { dycosConflictRows, retainedDycosResolutions } from './shared/dycosPartnerConflicts.js'
import { dycosPartnerRefreshAccounts } from './shared/dycosPartnerRefresh.js'
import { carrierPartnerPayload, customerPartnerPayload, importPartnerId } from './dycosPartnerPayloads.js'
import { businessPartnerHistoryChanges, mergePartnerHistoryPatch } from './shared/businessPartnerHistory.js'
import { fallbackShipmentTrackingRuleCatalog, normalizeShipmentTrackingRuleCatalog, SHIPMENT_TRACKING_RULE_CATALOG_PATH } from './shared/shipmentTrackingRuleCatalog.js'

const text = value => typeof value === 'string' ? value.trim() : ''
const actorName = profile => [text(profile.firstName), text(profile.lastName)].filter(Boolean).join(' ') || text(profile.email) || 'Unbekannt'
const sqlId = value => /^(0|[1-9]\d{0,9})$/.test(String(value)) && Number(value) <= 2147483647 ? String(value) : null
const identityError = () => new HttpsError('failed-precondition', 'Die Partnerzuordnung ist widersprüchlich oder mehrdeutig. Bitte die Stammdaten prüfen; es wurde nichts übernommen.')

export function validateDycosPartnerRequest(data) {
  const typ = text(data?.typ); const nummer = text(data?.nummer); const requestId = text(data?.requestId)
  if (!['kunde', 'utn'].includes(typ) || !sqlId(nummer)) throw new HttpsError('invalid-argument', 'Bitte eine gültige Debitoren- oder Kreditornummer eingeben.')
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Ungültige Anfrage-ID. Bitte die Seite neu laden.')
  const expectedPartnerId = data?.expectedPartnerId
  if (expectedPartnerId !== undefined && (typeof expectedPartnerId !== 'string' || !expectedPartnerId || expectedPartnerId.length > 200 || expectedPartnerId.includes('/'))) throw new HttpsError('invalid-argument', 'Ungültiges Stammdatenblatt.')
  return { typ, nummer, requestId, ...(expectedPartnerId === undefined ? {} : { expectedPartnerId }) }
}

export function mapDycosMasterData(payload, data) {
  const row = payload?.partner
  const customer = data.typ === 'kunde'
  const numberField = customer ? 'Debitorennummer' : 'Kreditorennummer'
  if (payload?.schemaVersion !== 1 || payload.typ !== data.typ || payload.nummer !== data.nummer || !row || Array.isArray(row)
    || !sqlId(row.ID) || sqlId(row[numberField]) !== data.nummer) throw new Error('Invalid partner response identity')
  const term = payload.zahlungsbedingung
  if (term != null && (typeof term !== 'object' || Array.isArray(term) || sqlId(term.ID) !== sqlId(row.Zahlungsbedingung) || !sqlId(term.ID))) throw new Error('Invalid payment term identity')
  const mapped = mapDycosPartnerData(customer ? { kunde: row, zahlungsbedingungKunde: term } : { unternehmerstamm: row, zahlungsbedingungUnternehmer: term })
  const counterpart = row[customer ? 'UnternehmerID' : 'KundenID']
  if (counterpart != null && counterpart !== '' && !sqlId(counterpart)) throw new Error('Invalid counterpart reference')
  return { ...(customer ? mapped.customer : mapped.carrier), number: data.nummer,
    counterpart: counterpart && Number(counterpart) > 0 ? { entity: customer ? 'carrier' : 'customer', id: sqlId(counterpart) } : null }
}

// Legacy TA imports already stored these source IDs. Follow merge redirects,
// but never fetch another DyCoS record or infer a partner from its name.
export async function resolveSource(transaction, db, source) {
  if (!source) return null
  const snapshots = await transaction.get(db.collection('businessPartners').where('dycosImport.sourceReferences', 'array-contains', { entity: source.entity, id: source.id }).limit(20))
  if (snapshots.size >= 20) throw identityError()
  const found = new Map()
  for (const snapshot of snapshots.docs) {
    let current = snapshot
    const visited = new Set()
    while (current.exists && current.get('mergedIntoPartnerId')) {
      if (visited.has(current.id) || visited.size >= 20) throw identityError()
      visited.add(current.id)
      const id = text(current.get('mergedIntoPartnerId'))
      if (!id || id.includes('/')) throw identityError()
      current = await transaction.get(db.doc(`businessPartners/${id}`))
    }
    if (!current.exists || current.get('status') === 'merged') throw identityError()
    found.set(current.id, { ...current.data(), id: current.id })
  }
  if (found.size > 1) throw identityError()
  return [...found.values()][0] || null
}

async function claimRequest(db, uid, data, token) {
  const key = createHash('sha256').update(`${uid}|${data.requestId}`).digest('hex')
  const receiptRef = db.doc(`dycosMasterDataRequests/${key}`)
  const lockRef = db.doc(`dycosMasterDataLocks/${data.typ}-${data.nummer}`)
  const quotaRef = db.doc(`dycosImportQuotas/${uid}`)
  return db.runTransaction(async tx => {
    const [receipt, lock, quota] = await Promise.all([tx.get(receiptRef), tx.get(lockRef), tx.get(quotaRef)])
    if (receipt.exists) {
      if (receipt.get('typ') !== data.typ || receipt.get('nummer') !== data.nummer) throw new HttpsError('invalid-argument', 'Diese Anfrage-ID wurde bereits für einen anderen Abruf verwendet.')
      return { result: receipt.get('result') }
    }
    const now = Date.now()
    if (lock.exists && lock.get('expiresAtMs') > now) throw new HttpsError('aborted', 'Diese Partnernummer wird bereits abgerufen. Bitte kurz warten.')
    const start = quota.exists && now - quota.get('windowStart') < 60_000 ? quota.get('windowStart') : now
    const count = start === quota.get('windowStart') ? Number(quota.get('count')) || 0 : 0
    if (count >= 10) throw new HttpsError('resource-exhausted', 'Zu viele Abrufe. Bitte eine Minute warten.')
    tx.set(quotaRef, { windowStart: start, count: count + 1 })
    tx.set(lockRef, { token, expiresAtMs: now + 180_000 })
    return { receiptRef, lockRef }
  })
}

export async function saveDycosMasterData({ db, request, data, incoming, claim, token }) {
  return db.runTransaction(async tx => {
    const [receipt, lock, user, catalog] = await Promise.all([tx.get(claim.receiptRef), tx.get(claim.lockRef), tx.get(db.doc(`users/${request.auth.uid}`)), tx.get(db.doc(SHIPMENT_TRACKING_RULE_CATALOG_PATH))])
    if (user.get('active') !== true || !hasDycosMasterDataAccess(user.data())) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Bearbeitung von Stammdaten.')
    if (receipt.exists) {
      if (data.expectedPartnerId && receipt.get('result.partnerId') !== data.expectedPartnerId) throw identityError()
      return receipt.get('result')
    }
    if (lock.get('token') !== token || lock.get('expiresAtMs') <= Date.now()) throw new HttpsError('aborted', 'Der Abruf ist abgelaufen. Bitte erneut versuchen.')
    const customer = data.typ === 'kunde'; const kind = customer ? 'debtor' : 'creditor'
    const field = customer ? 'debtorNumber' : 'creditorNumber'; const list = customer ? 'debtorNumbers' : 'creditorNumbers'
    const [byNumber, bySource, counterpart] = await Promise.all([
      resolvePartner(tx, db, kind, data.nummer),
      resolveSource(tx, db, { entity: incoming.sourceKind, id: incoming.sourceId }),
      resolveSource(tx, db, incoming.counterpart),
    ])
    const matches = new Map([byNumber, bySource, counterpart].filter(Boolean).map(partner => [partner.id, partner]))
    if (matches.size > 1) throw identityError()
    const existing = [...matches.values()][0]
    if (data.expectedPartnerId && (!existing || existing.id !== data.expectedPartnerId || !dycosPartnerRefreshAccounts(existing).some(account => account.typ === data.typ && account.nummer === data.nummer))) throw identityError()
    if ((existing?.dycosReferences?.accounts || []).some(account => account.entity === incoming.sourceKind && account.number === data.nummer && account.sourceId !== incoming.sourceId)) throw identityError()
    const id = existing?.id || importPartnerId(kind, data.nummer)
    const ref = db.doc(`businessPartners/${id}`)
    // Even if lookup found a different target via a counter-reference, the
    // deterministic ID must not conceal a conflicting legacy identity.
    if (!existing) { const check = await tx.get(ref); if (check.exists) throw identityError() }
    const now = FieldValue.serverTimestamp(); const name = actorName(user.data())
    const rules = catalog.exists ? normalizeShipmentTrackingRuleCatalog(catalog.data()) : fallbackShipmentTrackingRuleCatalog()
    const row = { externalNumber: '', imported: { customer: { name: '', debtorNumber: customer ? data.nummer : '' }, carrier: { originalName: '' }, contacts: {} } }
    const base = existing || (customer ? customerPartnerPayload : carrierPartnerPayload)(row, { partnerId: id, importRunId: data.requestId, now, ruleCatalog: rules })
    const additions = dycosPartnerAdditions(existing || {}, incoming.fields)
    const references = { ...(base.dycosReferences || {}), [list]: [...new Set([...(base.dycosReferences?.[list] || []), data.nummer])] }
    const sourceReferences = [...new Map([...(base.dycosImport?.sourceReferences || []), { entity: incoming.sourceKind, id: incoming.sourceId }].map(value => [`${value.entity}:${value.id}`, value])).values()]
    // Persist source IDs for each imported account; the counterpart's account
    // number/role is never invented or added from its internal reference.
    references.accounts = [...(references.accounts || []).filter(value => !(value.entity === incoming.sourceKind && value.number === data.nummer)), { entity: incoming.sourceKind, number: data.nummer, sourceId: incoming.sourceId }]
    const patch = mergePartnerHistoryPatch(base, additions.patch)
    if (!text(patch[field])) patch[field] = data.nummer
    patch.dycosReferences = references
    patch.dycosImport = { source: 'dycos-api', sourceReferences, lastSyncedAt: now, syncedByUserId: request.auth.uid, syncedByName: name, importRunId: data.requestId,
      conflicts: additions.conflicts, resolutions: retainedDycosResolutions(existing), conflictFingerprint: dycosPartnerReviewFingerprint(additions.conflicts), addedFields: additions.changedFields }
    const changes = existing ? businessPartnerHistoryChanges(existing, patch) : []
    if (existing && text(existing[field]) && existing[field] !== data.nummer && !(existing.dycosReferences?.[list] || []).includes(data.nummer)) changes.push({ path: `dycosReferences.${list}`, label: customer ? 'Weitere Debitorennummern' : 'Weitere Kreditorennummern', category: 'masterData', oldValue: existing.dycosReferences?.[list] || [], newValue: references[list] })
    const status = !existing ? 'new' : changes.length ? 'updated' : 'unchanged'
    if (!existing) {
      delete patch.taImportStatus
      patch.importOrigin = { source: 'dycosMasterData', channel: 'power-automate', importRunId: data.requestId, createdAt: now }
      patch.createdByUserId = request.auth.uid; patch.createdByName = name
      tx.create(ref, patch)
    } else {
      // Only mapped additions and trusted import metadata are written. Other
      // modules' settings and manual data are read within this transaction.
      const update = { ...additions.patch, dycosReferences: references, dycosImport: patch.dycosImport }
      for (const key of Object.keys(additions.patch)) update[key] = patch[key]
      if (!text(existing[field])) update[field] = data.nummer
      if (changes.length) { update.updatedAt = now; update.updatedByUserId = request.auth.uid; update.updatedByName = name }
      tx.update(ref, update)
    }
    if (!existing || changes.length) tx.create(ref.collection('history').doc(), {
      category: 'masterData', action: existing ? 'updated' : 'created', summary: existing ? 'Stammdaten aus DyCoS ergänzt' : 'Aus DyCoS-Abruf angelegt',
      ...(existing ? { metadata: { changes, importRunId: data.requestId } } : {}), source: 'dycos-api', createdAt: now, createdByUserId: request.auth.uid, createdByName: name,
    })
    const warningCodes = [...incoming.warningCodes]
    if (incoming.counterpart && !counterpart) warningCodes.push('PARTNER_COUNTERPART_NOT_MATCHED')
    const result = { status, partnerId: id, typ: data.typ, nummer: data.nummer, requestId: data.requestId, conflicts: dycosConflictRows(patch).length, warningCodes }
    tx.create(claim.receiptRef, { typ: data.typ, nummer: data.nummer, result, completedAt: now })
    tx.delete(claim.lockRef)
    return result
  })
}

export async function fetchDycosMasterDataHandler(request, { db = getFirestore(), fetchPartner = fetchDycosFlowPartner, report = recordDiagnostic } = {}) {
  const profile = await requireActiveProfile(request)
  if (!hasDycosMasterDataAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Bearbeitung von Stammdaten.')
  const data = validateDycosPartnerRequest(request.data)
  if (data.expectedPartnerId) {
    const snapshot = await db.doc(`businessPartners/${data.expectedPartnerId}`).get()
    const partner = snapshot.data()
    if (!snapshot.exists || partner.mergedIntoPartnerId || partner.status === 'merged' || !dycosPartnerRefreshAccounts(partner).some(account => account.typ === data.typ && account.nummer === data.nummer)) throw identityError()
  }
  const token = randomUUID(); const claim = await claimRequest(db, request.auth.uid, data, token)
  if (claim.result) {
    if (data.expectedPartnerId && claim.result.partnerId !== data.expectedPartnerId) throw identityError()
    return claim.result
  }
  let stage = 'fetch'
  try {
    const payload = await fetchPartner({ typ: data.typ, nummer: data.nummer })
    stage = 'mapping'
    const incoming = mapDycosMasterData(payload, data)
    stage = 'save'
    return await saveDycosMasterData({ db, request, data, incoming, claim, token })
  } catch (error) {
    if (error?.code === 'partner_not_found') throw new HttpsError('not-found', 'Unter dieser Nummer wurde in DyCoS kein Partner gefunden.', { sourceCode: 'PARTNER_NOT_FOUND' })
    const message = 'Die Stammdaten konnten nicht zuverlässig übernommen werden. Bitte denselben Abruf erneut versuchen.'
    try { await report({ module: 'dycos-master-data', stage: error?.stage || stage, code: ['source_auth', 'source_configuration', 'source_timeout', 'source_invalid_response', 'source_unavailable', 'partner_not_unique'].includes(error?.code) ? error.code : `dycos_partner_${stage}_failed`, message, actorId: request.auth.uid, actorName: actorName(profile), recordId: data.requestId }, db) } catch { /* Keep original error if diagnostics fail. */ }
    if (error instanceof HttpsError) throw error
    if (error?.code === 'partner_not_unique') throw identityError()
    throw new HttpsError('unavailable', message, { requestId: data.requestId })
  } finally {
    try { await db.runTransaction(async tx => { const lock = await tx.get(claim.lockRef); if (lock.get('token') === token) tx.delete(claim.lockRef) }) } catch { /* Lease bounds interrupted requests. */ }
  }
}
