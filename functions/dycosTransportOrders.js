import { createHash, randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { fetchDycosFlowOrder } from './dycosFlowClient.js'
import { mapDycosOrder, preserveDycosUnmappedFields } from './dycosOrderMapping.js'
import { customerPartnerPayload, carrierPartnerPayload, importPartnerId } from './transportOrderImports.js'
import { loadingScheduleMovedEarlier, transportOrderImportChanges, transportOrderImportFingerprint } from './transportOrderImportChanges.js'
import { fallbackShipmentTrackingRuleCatalog, normalizeShipmentTrackingRuleCatalog, SHIPMENT_TRACKING_RULE_CATALOG_PATH } from './shared/shipmentTrackingRuleCatalog.js'

const text = (value) => typeof value === 'string' ? value.trim() : ''
const actorName = (profile) => [text(profile.firstName), text(profile.lastName)].filter(Boolean).join(' ') || text(profile.email) || 'Unbekannt'
export const hasDycosImportAccess = (profile) => profile?.role === 'superadmin' || profile?.permissions?.dataImports === 'edit'
const orderIdFor = (number) => `dycos-${encodeURIComponent(number)}`
const leaseMs = 180_000
const versionOf = (snapshot) => snapshot.updateTime ? `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}` : null

export function validateDycosRequest(data) {
  const taNummer = text(data?.taNummer)
  // SQL's Nummer is an integer; canonical digits avoid multiple document IDs
  // for the same SQL number (e.g. 00123 and 123).
  if (!/^(0|[1-9]\d{0,9})$/.test(taNummer) || Number(taNummer) > 2147483647) throw new HttpsError('invalid-argument', 'Bitte eine gültige TA-Nummer eingeben.')
  const requestId = text(data?.requestId)
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Ungültige Anfrage-ID. Bitte die Seite neu laden.')
  return { taNummer, requestId }
}

// Matching by account identity is intentional: a similar company name is not
// sufficient evidence for linking a different legal/business partner.
async function resolvePartner(transaction, db, kind, number) {
  if (!number) return null
  const field = kind === 'debtor' ? 'debtorNumber' : 'creditorNumber'
  const refs = kind === 'debtor' ? 'debtorNumbers' : 'creditorNumbers'
  const [primary, aliases, deterministic] = await Promise.all([
    transaction.get(db.collection('businessPartners').where(field, '==', number).limit(20)),
    transaction.get(db.collection('businessPartners').where(`dycosReferences.${refs}`, 'array-contains', number).limit(20)),
    transaction.get(db.doc(`businessPartners/${importPartnerId(kind, number)}`)),
  ])
  if (primary.size >= 20 || aliases.size >= 20) throw new HttpsError('failed-precondition', 'Die Partnernummer ist nicht eindeutig. Bitte die Stammdatenzuordnung prüfen.')
  if (deterministic.exists) {
    const original = deterministic.data()
    const referenceNumbers = original.dycosReferences?.[refs]
    if (text(original[field]) !== number && !(Array.isArray(referenceNumbers) && referenceNumbers.map(text).includes(number))) throw new HttpsError('failed-precondition', 'Die gespeicherte Partneridentität widerspricht der angefragten Nummer. Bitte die Stammdatenzuordnung prüfen.')
  }
  const matches = new Map()
  for (const snapshot of [...primary.docs, ...aliases.docs, ...(deterministic.exists ? [deterministic] : [])]) {
    let current = snapshot
    const visited = new Set()
    while (current.exists && current.get('mergedIntoPartnerId')) {
      if (visited.has(current.id) || visited.size >= 20) throw new HttpsError('failed-precondition', 'Die Partnerzusammenführung muss geprüft werden.')
      visited.add(current.id)
      const target = text(current.get('mergedIntoPartnerId'))
      if (!target || target.includes('/')) throw new HttpsError('failed-precondition', 'Ungültige Partnerzusammenführung.')
      current = await transaction.get(db.doc(`businessPartners/${target}`))
    }
    if (!current.exists || current.get('status') === 'merged') throw new HttpsError('failed-precondition', 'Der Zielpartner einer Zusammenführung fehlt. Bitte die Stammdaten prüfen.')
    matches.set(current.id, { ...current.data(), id: current.id })
  }
  if (matches.size > 1) throw new HttpsError('failed-precondition', 'Die Partnernummer ist mehreren Geschäftspartnern zugeordnet. Bitte die Stammdatenzuordnung prüfen.')
  return [...matches.values()][0] || null
}

function planPartner(row, kind, found, runId, now, ruleCatalog) {
  if (found) return { partner: found, create: false }
  const customer = kind === 'debtor'
  const number = customer ? row.imported.customer.debtorNumber : row.imported.carrier.creditorNumber
  const name = customer ? row.imported.customer.name : row.imported.carrier.originalName
  if (!number || !name) return { partner: null, create: false }
  const id = importPartnerId(kind, number)
  const payload = customer ? customerPartnerPayload(row, { partnerId: id, importRunId: runId, now, ruleCatalog }) : carrierPartnerPayload(row, { partnerId: id, importRunId: runId, now, ruleCatalog })
  if (!customer) {
    payload.creditorNumber = number
    payload.dycosReferences.creditorNumbers = [number]
    payload.address = { ...payload.address, ...row.imported.carrier.snapshot }
    delete payload.taImportStatus
  }
  payload.importOrigin.channel = 'power-automate'
  return { partner: payload, create: true }
}

function linkPartner(value, plan) {
  return { ...value, partnerId: plan.partner?.id || '', partnerName: plan.partner?.companyName || '', ...(Object.hasOwn(value, 'matchStatus') ? { matchStatus: plan.partner ? (plan.create ? 'created' : 'linked') : 'unlinked' } : {}) }
}

async function claimRequest(db, uid, data, token, nowMs) {
  const key = createHash('sha256').update(`${uid}|${data.requestId}`).digest('hex')
  const receiptRef = db.doc(`dycosImportRequests/${key}`)
  const lockRef = db.doc(`dycosImportLocks/${orderIdFor(data.taNummer)}`)
  const orderRef = db.doc(`transportOrders/${orderIdFor(data.taNummer)}`)
  const quotaRef = db.doc(`dycosImportQuotas/${uid}`)
  return db.runTransaction(async (transaction) => {
    const [receipt, lock, order, quota] = await Promise.all([transaction.get(receiptRef), transaction.get(lockRef), transaction.get(orderRef), transaction.get(quotaRef)])
    if (receipt.exists) {
      if (receipt.get('externalNumber') !== data.taNummer) throw new HttpsError('invalid-argument', 'Die Anfrage-ID wurde bereits für einen anderen Auftrag verwendet.')
      return { result: receipt.get('result') }
    }
    if (lock.exists && lock.get('expiresAtMs') > nowMs) throw new HttpsError('aborted', 'Diese TA wird bereits abgerufen. Bitte kurz warten und erneut versuchen.')
    const start = quota.exists && nowMs - quota.get('windowStart') < 60_000 ? quota.get('windowStart') : nowMs
    const count = start === quota.get('windowStart') ? Number(quota.get('count')) || 0 : 0
    if (count >= 10) throw new HttpsError('resource-exhausted', 'Zu viele Abrufe. Bitte eine Minute warten.')
    transaction.set(quotaRef, { windowStart: start, count: count + 1 })
    transaction.set(lockRef, { token, expiresAtMs: nowMs + leaseMs })
    return { receiptRef, lockRef, orderRef, baseVersion: versionOf(order) }
  })
}

async function releaseClaim(db, claim, token) {
  await db.runTransaction(async (transaction) => {
    const lock = await transaction.get(claim.lockRef)
    if (lock.get('token') === token) transaction.delete(claim.lockRef)
  })
}

export async function saveDycosTransportOrder({ db, request, profile, data, imported, claim, token, nowMs = Date.now() }) {
  const runRef = db.collection('transportOrderImportRuns').doc()
  const rowRef = runRef.collection('rows').doc('request')
  const now = FieldValue.serverTimestamp()
  return db.runTransaction(async (transaction) => {
    const [receipt, lock, order, catalog, tracking] = await Promise.all([
      transaction.get(claim.receiptRef), transaction.get(claim.lockRef), transaction.get(claim.orderRef),
      transaction.get(db.doc(SHIPMENT_TRACKING_RULE_CATALOG_PATH)), transaction.get(db.doc(`transportOrderTrackings/${claim.orderRef.id}`)),
    ])
    if (receipt.exists) return receipt.get('result')
    if (lock.get('token') !== token || lock.get('expiresAtMs') <= nowMs) throw new HttpsError('aborted', 'Der Abruf ist abgelaufen. Bitte erneut versuchen.')
    if (versionOf(order) !== claim.baseVersion) throw new HttpsError('aborted', 'Der Auftrag wurde während des Abrufs geändert. Bitte erneut abrufen.')
    const previous = order.exists ? order.get('imported') || {} : null
    const preserved = preserveDycosUnmappedFields(previous, imported)
    imported = preserved.imported
    const [customer, carrier] = await Promise.all([
      resolvePartner(transaction, db, 'debtor', imported.customer.debtorNumber),
      resolvePartner(transaction, db, 'creditor', imported.carrier.creditorNumber),
    ])
    const ruleCatalog = catalog.exists ? normalizeShipmentTrackingRuleCatalog(catalog.data()) : fallbackShipmentTrackingRuleCatalog()
    const row = { externalNumber: data.taNummer, imported }
    const customerPlan = planPartner(row, 'debtor', customer, runRef.id, now, ruleCatalog)
    const carrierPlan = planPartner(row, 'creditor', carrier, runRef.id, now, ruleCatalog)
    const next = { ...imported, customer: linkPartner(imported.customer, customerPlan), carrier: linkPartner(imported.carrier, carrierPlan) }
    // Link creation status is not a business-data change on repeat imports.
    if (previous?.carrier?.partnerId === next.carrier.partnerId && previous?.carrier?.matchStatus) next.carrier.matchStatus = previous.carrier.matchStatus
    const changes = previous ? transportOrderImportChanges(previous, next) : []
    if (previous) for (const [kind, label] of [['customer', 'Kundenverknüpfung'], ['carrier', 'Unternehmerverknüpfung']]) {
      if ((previous[kind]?.partnerId || '') !== next[kind].partnerId) changes.push({ path: `${kind}.partnerId`, label, oldValue: previous[kind]?.partnerId || null, newValue: next[kind].partnerId || null })
    }
    const linkedIdsUnchanged = previous?.customer?.partnerId === next.customer.partnerId && previous?.carrier?.partnerId === next.carrier.partnerId
    const status = !order.exists ? 'new' : transportOrderImportFingerprint(previous) === transportOrderImportFingerprint(next) && linkedIdsUnchanged ? 'unchanged' : 'updated'
    const counts = { Neu: status === 'new' ? 1 : 0, Aktualisiert: status === 'updated' ? 1 : 0, Unverändert: status === 'unchanged' ? 1 : 0, 'Prüfung erforderlich': 0, Fehlerhaft: 0 }
    const result = { status, orderId: claim.orderRef.id, externalNumber: data.taNummer, requestId: data.requestId, runId: runRef.id, warningCodes: imported.source.warningCodes }
    const patch = { externalNumber: data.taNummer, source: 'dycos', imported: next, importedFingerprint: transportOrderImportFingerprint(next), importMeta: { ...(order.get('importMeta') || {}), source: 'dycos', channel: 'power-automate', importRunId: runRef.id, requestId: data.requestId, preservedLegacyFields: preserved.preservedPaths, ...(order.exists ? {} : { importedAt: now }), lastImportedAt: now }, updatedAt: now, updatedBy: request.auth.uid, updatedByName: actorName(profile) }
    delete patch.importMeta.fileName
    if (changes.some((change) => change.routeRelevant)) Object.assign(patch, { routeNeedsRecalculation: true, routeNeedsRecalculationAt: now })
    for (const plan of [customerPlan, carrierPlan]) if (plan.create) {
      const partnerRef = db.doc(`businessPartners/${plan.partner.id}`)
      transaction.create(partnerRef, plan.partner)
      transaction.create(partnerRef.collection('history').doc(), { category: 'import', action: 'created', summary: 'Aus DyCoS-Abruf erstellt', source: 'dycosTransportOrder', channel: 'power-automate', transportOrderNumber: data.taNummer, importRunId: runRef.id, createdAt: now })
    }
    if (order.exists) transaction.update(claim.orderRef, patch)
    else transaction.create(claim.orderRef, { id: claim.orderRef.id, ...patch, manual: {}, tracking: {}, createdAt: now, createdBy: request.auth.uid, createdByName: actorName(profile) })
    for (const change of changes) transaction.create(claim.orderRef.collection('history').doc(), { eventType: 'transport_order_import_updated', changedFields: [change.path], field: change.path, fieldLabel: change.label, oldValue: change.oldValue, newValue: change.newValue, eventTime: now, recordedAt: now, recordedBy: request.auth.uid, recordedByName: actorName(profile), source: 'import', importRunId: runRef.id })
    if (previous && loadingScheduleMovedEarlier(previous, next) && tracking.exists && tracking.get('lifecycleStatus') === 'active') transaction.update(tracking.ref, { importScheduleSkippedBefore: now, lastImportScheduleChange: { reason: 'loading-moved-earlier', at: now }, updatedAt: now, updatedBy: request.auth.uid, updatedByName: actorName(profile) })
    transaction.create(runRef, { id: runRef.id, source: 'dycos-api', externalNumber: data.taNummer, importedAt: now, importedByUserId: request.auth.uid, importedByName: actorName(profile), counts })
    transaction.create(rowRef, { rowNumber: 1, externalNumber: data.taNummer, customerName: next.customer.name, carrierName: next.carrier.originalName, status: { new: 'Neu', updated: 'Aktualisiert', unchanged: 'Unverändert' }[status], changedFields: changes.map((change) => change.label), customerAction: customerPlan.create ? 'neu angelegt' : customer ? 'verwendet' : 'nicht verknüpft', carrierAction: carrierPlan.create ? 'neu angelegt' : carrier ? 'verwendet' : 'nicht verknüpft', createdAt: now })
    transaction.create(claim.receiptRef, { externalNumber: data.taNummer, result, completedAt: now })
    transaction.delete(claim.lockRef)
    return result
  })
}

export async function fetchDycosTransportOrderHandler(request, { db = getFirestore(), fetchOrder = fetchDycosFlowOrder, report = recordDiagnostic } = {}) {
  const profile = await requireActiveProfile(request)
  if (!hasDycosImportAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Datenimporte.')
  const data = validateDycosRequest(request.data)
  const token = randomUUID()
  const claim = await claimRequest(db, request.auth.uid, data, token, Date.now())
  if (claim.result) return claim.result
  let stage = 'fetch'
  try {
    const payload = await fetchOrder(data.taNummer)
    stage = 'mapping'
    const imported = mapDycosOrder(payload, data.taNummer)
    stage = 'save'
    return await saveDycosTransportOrder({ db, request, profile, data, imported, claim, token })
  } catch (error) {
    if (error instanceof HttpsError) throw error
    if (error?.code === 'ta_not_found') throw new HttpsError('not-found', 'Die TA-Nummer wurde in DyCoS nicht gefunden.', { sourceCode: 'TA_NOT_FOUND', requestId: data.requestId })
    const message = stage === 'mapping' ? 'DyCoS hat ungültige oder widersprüchliche Auftragsdaten geliefert. Es wurde kein Auftrag gespeichert.' : stage === 'save' ? 'Der Auftrag konnte nicht zuverlässig gespeichert werden. Bitte denselben Abruf erneut versuchen.' : 'Die DyCoS-Schnittstelle konnte nicht abgerufen werden. Bitte erneut versuchen.'
    try { await report({ module: 'dycos-import', stage: error?.stage || stage, code: ['source_configuration', 'source_auth', 'source_timeout', 'source_invalid_response', 'source_unavailable'].includes(error?.code) ? error.code : `dycos_${stage}_failed`, message, actorId: request.auth.uid, actorName: actorName(profile), orderId: '', recordId: data.requestId }, db) } catch { /* diagnostic failure must not replace the original failure */ }
    throw new HttpsError('unavailable', message, { requestId: data.requestId })
  } finally {
    // Release failures cannot turn an already committed import into an error.
    // A lease also expires if a process is terminated before cleanup.
    try { await releaseClaim(db, claim, token) } catch { /* bounded by lease */ }
  }
}
