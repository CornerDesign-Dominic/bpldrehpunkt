import { createHash, randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { fetchDycosTransportOrderHandler } from './dycosTransportOrders.js'
import { refreshDycosMasterDataHandler } from './dycosPartnerRefresh.js'
import { applyTransportOrderQueryFilters, normalizeTransportOrderListPageSize } from './transportOrderList.js'
import { transportOrderListProjectionState } from './transportOrderListProjection.js'
import { recordDiagnostic } from './diagnostics.js'

const scopes = new Set(['all', 'order', 'partners'])
const sortFields = {
  externalNumber: 'externalNumber', relation: 'imported.relation', customer: 'imported.customer.name', carrier: 'imported.carrier.originalName',
  loading: 'imported.loading.city', unloading: 'imported.unloading.city', loadingFrom: 'imported.loading.window.from', unloadingUntil: 'imported.unloading.window.until',
}
const text = value => typeof value === 'string' ? value.trim() : ''
const access = (profile, module, level = 'view') => profile?.role === 'superadmin' || (level === 'view' ? ['view', 'edit'].includes(profile?.permissions?.[module]) : profile?.permissions?.[module] === 'edit')
const actor = profile => [text(profile.firstName), text(profile.lastName)].filter(Boolean).join(' ') || 'Unbekannt'
const hash = value => createHash('sha256').update(value).digest('hex')
const leaseMs = 10 * 60_000

function date(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

export function normalizeOrderRecordsQuery(data = {}) {
  const result = {
    search: text(data.search).toLocaleLowerCase('de-DE'), relation: text(data.relation), loadingFrom: text(data.loadingFrom), loadingUntil: text(data.loadingUntil),
    cursor: text(data.cursor), pageSize: normalizeTransportOrderListPageSize(data.pageSize),
    sortKey: Object.hasOwn(sortFields, data.sort?.key) ? data.sort.key : null, direction: data.sort?.direction === 'asc' ? 'asc' : 'desc',
  }
  if (result.search.length > 180 || result.relation.length > 180 || result.cursor.length > 240 || !date(result.loadingFrom) || !date(result.loadingUntil) || result.loadingFrom && result.loadingUntil && result.loadingFrom > result.loadingUntil) throw new HttpsError('invalid-argument', 'Ungültige Listenabfrage.')
  return result
}

export function orderRecordMatches(order, filters) {
  const imported = order.imported || {}
  const searchable = [order.externalNumber, imported.customerReference, imported.customer?.name, imported.customer?.debtorNumber, imported.carrier?.originalName, imported.carrier?.creditorNumber, imported.loading?.city, imported.unloading?.city, imported.relation].filter(Boolean).join(' ').toLocaleLowerCase('de-DE')
  const raw = imported.loading?.window?.from
  const start = typeof raw === 'string' ? raw.slice(0, 10) : raw?.toDate?.().toISOString().slice(0, 10) || ''
  return (!filters.search || searchable.includes(filters.search)) && (!filters.relation || text(imported.relation) === filters.relation) &&
    ((!filters.loadingFrom && !filters.loadingUntil) || Boolean(start) && (!filters.loadingFrom || start >= filters.loadingFrom) && (!filters.loadingUntil || start <= filters.loadingUntil))
}

export async function listTransportOrderRecordsPageHandler(request, deps = {}) {
  const profile = await (deps.requireProfile || requireActiveProfile)(request)
  if (!access(profile, 'transportOrders')) throw new HttpsError('permission-denied', 'Keine Berechtigung für Transportaufträge.')
  const filters = normalizeOrderRecordsQuery(request.data)
  const db = deps.db || getFirestore()
  const orders = db.collection('transportOrders')
  const state = await db.doc(transportOrderListProjectionState).get()
  let cursor = filters.cursor ? await orders.doc(filters.cursor).get() : null
  if (cursor && !cursor.exists) throw new HttpsError('invalid-argument', 'Der Listencursor ist nicht mehr gültig.')
  const results = []
  while (true) {
    let query = applyTransportOrderQueryFilters(orders, filters, state.get('complete') === true)
      .orderBy(filters.sortKey ? sortFields[filters.sortKey] : 'importMeta.lastImportedAt', filters.sortKey ? filters.direction : 'desc').limit(filters.pageSize + 1)
    if (cursor) query = query.startAfter(cursor)
    const batch = await query.get()
    for (const entry of batch.docs) {
      const order = { ...entry.data(), id: entry.id }
      if (!orderRecordMatches(order, filters)) continue
      if (results.length === filters.pageSize) return { orders: results, hasMore: true, nextCursor: results.at(-1).id }
      results.push(order)
    }
    if (batch.docs.length < filters.pageSize + 1) return { orders: results, hasMore: false, nextCursor: null }
    cursor = batch.docs.at(-1)
  }
}

export function validateWorkspaceRefresh(data = {}) {
  const orderId = text(data.orderId), scope = data.scope, requestId = text(data.requestId)
  if (!orderId || orderId.length > 240 || orderId.includes('/') || !scopes.has(scope) || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Ungültige Aktualisierungsanfrage.')
  return { orderId, scope, requestId }
}

export function requireWorkspaceRefreshAccess(profile, scope) {
  if (!access(profile, 'transportOrders') || scope !== 'partners' && !access(profile, 'dataImports', 'edit') || scope !== 'order' && !access(profile, 'masterData', 'edit')) throw new HttpsError('permission-denied', 'Für diese Aktualisierung fehlen Auftrags-, Datenimport- oder Stammdatenrechte.')
}

const errorCode = error => {
  const code = text(error?.code).replace(/^functions\//, '')
  if (code === 'data-loss') return 'invalid-response'
  return ['aborted', 'failed-precondition', 'not-found', 'permission-denied', 'unauthenticated', 'unavailable', 'resource-exhausted', 'invalid-argument', 'deadline-exceeded'].includes(code) ? code : 'unknown'
}
const safeResult = (result, kind) => {
  if (!(kind === 'order' ? ['updated', 'unchanged', 'new'] : ['updated', 'unchanged']).includes(result?.status)) throw new HttpsError('data-loss', 'Die Aktualisierung hat kein gültiges Ergebnis geliefert.')
  return { status: result.status, conflicts: Number.isSafeInteger(result?.conflicts) ? result.conflicts : Number.isSafeInteger(result?.partnerUpdates?.conflicts) ? result.partnerUpdates.conflicts : 0 }
}

async function reportInvalidResult(error, request, profile, data, deps, db) {
  if (error?.code !== 'data-loss') return
  try { await (deps.report || recordDiagnostic)({ module: 'dycos-import', stage: 'workspace-response', code: 'source_invalid_response', message: 'Eine Teilaktualisierung hat kein gültiges Ergebnis geliefert.', actorId: request.auth.uid, actorName: actor(profile), orderId: data.orderId }, db) } catch { /* Diagnostics never replace the original failure. */ }
}

async function reserve(db, request, profile, data, token, now) {
  const recordId = hash(`${request.auth.uid}|${data.requestId}`)
  const ref = db.doc(`transportOrders/${data.orderId}/refreshes/${recordId}`)
  const bindingRef = db.doc(`transportOrderWorkspaceRequests/${recordId}`)
  const lockRef = db.doc(`transportOrderWorkspaceLocks/${data.orderId}`)
  return db.runTransaction(async tx => {
    const [binding, receipt, lock, order] = await Promise.all([tx.get(bindingRef), tx.get(ref), tx.get(lockRef), tx.get(db.doc(`transportOrders/${data.orderId}`))])
    if (binding.exists && (binding.get('orderId') !== data.orderId || binding.get('scope') !== data.scope)) throw new HttpsError('invalid-argument', 'Diese Anfrage-ID wurde bereits für einen anderen Abruf verwendet.')
    if (!order.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
    if (receipt.exists) {
      if (receipt.get('result')) return { result: receipt.get('result') }
      // Do not run an uncertain import twice. A completed child import has its
      // own receipt, but a crash may have happened between either child and us.
      if (receipt.get('leaseUntilMs') > now) throw new HttpsError('aborted', 'Die Aktualisierung läuft bereits. Bitte kurz warten.')
      const result = { status: 'failed', scope: data.scope, recordId, order: null, partners: [], code: 'interrupted', completedAt: new Date(now).toISOString() }
      tx.update(ref, { status: 'failed', completedAt: FieldValue.serverTimestamp(), result })
      if (lock.get('recordId') === recordId) tx.delete(lockRef)
      return { result }
    }
    if (lock.exists && lock.get('leaseUntilMs') > now) throw new HttpsError('aborted', 'Dieser Auftrag wird bereits aktualisiert. Bitte kurz warten.')
    const number = text(order.get('externalNumber'))
    if (data.scope !== 'partners' && !/^(0|[1-9]\d{0,9})$/.test(number)) throw new HttpsError('failed-precondition', 'Dieser Auftrag besitzt keine abrufbare DyCoS-Nummer.')
    tx.create(bindingRef, { orderId: data.orderId, scope: data.scope, ownerId: request.auth.uid })
    tx.create(ref, { scope: data.scope, status: 'running', actorId: request.auth.uid, actorName: actor(profile), startedAt: FieldValue.serverTimestamp(), leaseUntilMs: now + leaseMs })
    tx.set(lockRef, { token, recordId, leaseUntilMs: now + leaseMs })
    return { ref, lockRef, recordId, number }
  })
}

async function partnerTargets(db, orderId) {
  const order = await db.doc(`transportOrders/${orderId}`).get()
  const ids = [...new Set([order.get('imported.customer.partnerId'), order.get('imported.carrier.partnerId')].filter(Boolean))]
  const resolved = new Set()
  for (const id of ids) {
    let current = id
    const visited = new Set()
    for (;;) {
      if (typeof current !== 'string' || current.includes('/') || visited.has(current) || visited.size >= 20) throw new HttpsError('failed-precondition', 'Die Partnerzuordnung muss geprüft werden.')
      visited.add(current)
      const partner = await db.doc(`businessPartners/${current}`).get()
      if (!partner.exists) throw new HttpsError('not-found', 'Ein zugeordneter Geschäftspartner fehlt.')
      const target = partner.get('mergedIntoPartnerId')
      if (!target) { resolved.add(current); break }
      current = target
    }
  }
  return [...resolved]
}

export async function refreshTransportOrderWorkspaceHandler(request, deps = {}) {
  const profile = await (deps.requireProfile || requireActiveProfile)(request)
  const data = validateWorkspaceRefresh(request.data)
  requireWorkspaceRefreshAccess(profile, data.scope)
  const db = deps.db || getFirestore(), token = randomUUID(), now = deps.now || Date.now
  const claim = await reserve(db, request, profile, data, token, now())
  if (claim.result) return claim.result
  const result = { status: 'success', recordId: claim.recordId, scope: data.scope, order: null, partners: [] }
  let succeeded = 0, failed = 0
  if (data.scope !== 'partners') {
    try {
      const response = await (deps.fetchOrder || fetchDycosTransportOrderHandler)({ ...request, data: { taNummer: claim.number, requestId: `ow-${hash(`${request.auth.uid}|${data.requestId}|order`)}` } })
      result.order = safeResult(response, 'order'); succeeded++
    } catch (error) { await reportInvalidResult(error, request, profile, data, deps, db); result.order = { status: 'failed', code: errorCode(error) }; failed++ }
  }
  // If the order refresh failed, its partner binding may be stale. Do not
  // refresh the previously bound partner and imply it belongs to the new TA.
  if (data.scope !== 'order' && result.order?.status !== 'failed') {
    try {
      const targets = await partnerTargets(db, data.orderId)
      if (!targets.length) { result.partners.push({ status: 'skipped', code: 'no-linked-partners' }) }
      for (const partnerId of targets) {
        try {
          const response = await (deps.refreshPartner || refreshDycosMasterDataHandler)({ ...request, data: { partnerId, requestId: `ow-${hash(`${request.auth.uid}|${data.requestId}|${partnerId}`)}` } })
          result.partners.push({ partnerId, ...safeResult(response, 'partner') }); succeeded++
        } catch (error) { await reportInvalidResult(error, request, profile, data, deps, db); result.partners.push({ partnerId, status: 'failed', code: errorCode(error) }); failed++ }
      }
    } catch (error) { result.partners.push({ status: 'failed', code: errorCode(error) }); failed++ }
  }
  result.status = failed ? succeeded ? 'partial' : 'failed' : 'success'
  result.completedAt = new Date(now()).toISOString()
  // Finish result and release ownership atomically. Losing the response can be
  // retried with the same request ID without repeating any source calls.
  try {
    await db.runTransaction(async tx => {
      const lock = await tx.get(claim.lockRef)
      tx.update(claim.ref, { status: result.status, completedAt: FieldValue.serverTimestamp(), result })
      if (lock.get('token') === token) tx.delete(claim.lockRef)
    })
  } catch {
    try { await (deps.report || recordDiagnostic)({ module: 'dycos-import', stage: 'workspace-receipt', code: 'workspace_receipt_failed', message: 'Das Ergebnis der Auftragsaktualisierung konnte nicht zuverlässig bestätigt werden.', actorId: request.auth.uid, actorName: actor(profile), orderId: data.orderId, recordId: claim.recordId }, db) } catch { /* Preserve the original outcome uncertainty. */ }
    throw new HttpsError('unavailable', 'Die Aktualisierung konnte nicht bestätigt werden. Bitte denselben Abruf erneut prüfen.', { recordId: claim.recordId })
  }
  return result
}
