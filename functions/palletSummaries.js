import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'
import { indexPartnerClusters } from './partnerCluster.js'
import { recordDiagnostic } from './diagnostics.js'

export const PALLET_SUMMARY_STATE = 'palletSummaryState/current'
const VERSION = 1
const numeric = (value) => Number(value) || 0
const text = (value) => typeof value === 'string' ? value.trim() : ''
export const palletTourNumberKey = (value) => text(value).toLocaleLowerCase('de-DE')
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const allowed = (profile, level = 'view') => profile?.role === 'superadmin' || (level === 'edit' ? profile?.permissions?.pallets === 'edit' : ['view', 'edit'].includes(profile?.permissions?.pallets))
export function requirePalletAccess(profile, level = 'view') {
  if (!allowed(profile, level)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Palettenkonten.')
}
const ready = (state) => state?.version === VERSION && state?.status === 'ready'
const participants = (movement) => [...new Set([movement.partnerId, movement.customerId, movement.carrierId].filter(Boolean))].sort()
export function movementBucketId(movement) { return hash(participants(movement)) }
export function movementContribution(movement, ids) {
  if (ids.includes(movement.partnerId)) return numeric(movement.incoming) - numeric(movement.outgoing)
  return (ids.includes(movement.carrierId) ? numeric(movement.carrierBalance) : 0) + (ids.includes(movement.customerId) ? numeric(movement.customerBalance) : 0)
}
export function applyMovementToBucket(current, movement, direction) {
  const ids = participants(movement)
  const bucket = { ids, count: numeric(current?.count) + direction, masks: { ...current?.masks } }
  for (let mask = 1; mask < 2 ** ids.length; mask += 1) {
    const members = ids.filter((_, index) => mask & (1 << index))
    const change = movementContribution(movement, members)
    const old = bucket.masks[mask] || {}
    bucket.masks[mask] = { incoming: numeric(old.incoming) + direction * Math.max(0, change), outgoing: numeric(old.outgoing) + direction * Math.max(0, -change), balance: numeric(old.balance) + direction * change }
  }
  return bucket
}
export function accountFromBuckets(buckets, closings, memberIds) {
  const members = new Set(memberIds)
  const result = { totalIncoming: 0, totalOutgoing: 0, balance: 0, latestClosing: null }
  for (const bucket of buckets) {
    const mask = bucket.ids.reduce((value, id, index) => value | (members.has(id) ? 1 << index : 0), 0)
    const values = bucket.masks[mask]
    if (!values) continue
    result.totalIncoming += values.incoming; result.totalOutgoing += values.outgoing; result.balance += values.balance
  }
  for (const closing of closings) {
    if (!members.has(closing.partnerId)) continue
    result.balance += numeric(closing.adjustmentSum)
    if (closing.latestClosing && (!result.latestClosing || compareClosings(result.latestClosing, closing.latestClosing) < 0)) result.latestClosing = closing.latestClosing
  }
  return result
}
const timestamp = (value) => value instanceof Timestamp ? value : Timestamp.fromMillis(0)
const milliseconds = (value) => timestamp(value).toMillis()
function compareClosings(a, b) { return text(a.date).localeCompare(text(b.date)) || (milliseconds(a.createdAt) || 0) - (milliseconds(b.createdAt) || 0) || Buffer.compare(Buffer.from(text(a.id)), Buffer.from(text(b.id))) }
const closingInfo = (id, data) => ({ id, date: text(data.date), createdAt: timestamp(data.createdAt) })
function bucketRef(db, generation, kind, id) { return db.doc(`palletSummaryGenerations/${generation}/${kind}/${id}`) }

function normalizeRecord(kind, values) {
  if (!values || typeof values !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(values.date || '') || Number.isNaN(Date.parse(`${values.date}T00:00:00Z`)) || new Date(`${values.date}T00:00:00Z`).toISOString().slice(0, 10) !== values.date) throw new HttpsError('invalid-argument', 'Gültiges Buchungsdatum erforderlich.')
  const identifier = (value) => { if (!value) return null; if (typeof value !== 'string' || value.length > 240 || value.includes('/')) throw new HttpsError('invalid-argument', 'Ungültiger Geschäftspartner.'); return value }
  const number = (value) => { if (value != null && !['string', 'number'].includes(typeof value)) throw new HttpsError('invalid-argument', 'Ungültige Palettenanzahl.'); const result = value === '' || value == null ? 0 : Number(value); if (!Number.isFinite(result)) throw new HttpsError('invalid-argument', 'Ungültige Palettenanzahl.'); return result }
  if (kind === 'closing') return { partnerId: identifier(values.partnerId), date: values.date, type: text(values.type), reference: text(values.reference), note: text(values.note), previousBalance: number(values.previousBalance), adjustment: number(values.adjustment), newBalance: number(values.newBalance) }
  const point = (value) => { const received = number(value?.received), delivered = number(value?.delivered); if (!Number.isSafeInteger(received) || !Number.isSafeInteger(delivered) || received < 0 || delivered < 0) throw new HttpsError('invalid-argument', 'Palettenanzahlen müssen nicht-negative ganze Zahlen sein.'); return { received, delivered, carrierChange: delivered - received, note: text(value?.note) } }
  const loadingPoint = point(values.loadingPoint), unloadingPoint = point(values.unloadingPoint)
  const carrierBalance = loadingPoint.carrierChange + unloadingPoint.carrierChange
  if (!Number.isSafeInteger(carrierBalance)) throw new HttpsError('invalid-argument', 'Die Palettenmenge ist zu groß.')
  const tourNumber = text(values.tourNumber)
  return { tourNumber, tourNumberKey: palletTourNumberKey(tourNumber), date: values.date, customerId: identifier(values.customerId), carrierId: identifier(values.carrierId), palletReceiptNumber: text(values.palletReceiptNumber), palletType: ['Europalette', 'Düsseldorfer', 'Gitterbox'].includes(values.palletType) ? values.palletType : 'Europalette', note: text(values.note), loadingPoint, unloadingPoint, carrierBalance, customerBalance: -carrierBalance }
}

export async function savePalletRecordHandler(request, { db = getFirestore(), authorize = requireActiveProfile } = {}) {
  const profile = await authorize(request); requirePalletAccess(profile, 'edit')
  const { kind, action, operationId } = request.data || {}
  if (!['movement', 'closing'].includes(kind) || !['create', 'update', 'delete'].includes(action) || !/^[a-zA-Z0-9-]{16,100}$/.test(operationId || '')) throw new HttpsError('invalid-argument', 'Ungültige Palettenaktion.')
  const collection = kind === 'movement' ? 'palletMovements' : 'palletClosings'
  const id = action === 'create' ? operationId : request.data.id
  if (typeof id !== 'string' || !id || id.length > 240 || id.includes('/')) throw new HttpsError('invalid-argument', 'Ungültige Buchung.')
  const values = action === 'delete' ? null : normalizeRecord(kind, request.data.values)
  const signature = hash({ kind, action, id, values, expectedRevision: request.data.expectedRevision ?? null })
  try {
    return await db.runTransaction(async (tx) => {
      const stateRef = db.doc(PALLET_SUMMARY_STATE), ref = db.doc(`${collection}/${id}`), receiptRef = db.doc(`palletMutationReceipts/${request.auth.uid}-${operationId}`)
      const [stateSnapshot, snapshot, receipt] = await Promise.all([tx.get(stateRef), tx.get(ref), tx.get(receiptRef)])
      if (receipt.exists) { if (receipt.data().signature !== signature) throw new HttpsError('already-exists', 'Die Vorgangskennung wurde bereits verwendet.'); return { id } }
      const state = stateSnapshot.data()
      if (state?.status === 'building') throw new HttpsError('failed-precondition', 'Die Palettenkonten werden vorbereitet. Bitte danach erneut speichern.')
      if (action !== 'create' && !snapshot.exists) throw new HttpsError('not-found', 'Palettenbuchung nicht gefunden.')
      if (action === 'create' && snapshot.exists) throw new HttpsError('already-exists', 'Die Buchung existiert bereits.')
      const old = snapshot.exists ? snapshot.data() : null
      if (old && (!Number.isInteger(request.data.expectedRevision) || request.data.expectedRevision !== (old.revision || 0))) throw new HttpsError('aborted', 'Die Buchung wurde zwischenzeitlich geändert. Bitte neu laden; deine Eingaben bleiben erhalten.')
      if (values && kind === 'closing' && action === 'update') values.partnerId = old.partnerId
      if (values && kind === 'closing' && !values.partnerId) throw new HttpsError('invalid-argument', 'Geschäftspartner erforderlich.')
      const now = Timestamp.now()
      const next = values ? { ...old, ...values, createdAt: old ? timestamp(old.createdAt) : now, updatedAt: now, revision: (old?.revision || 0) + 1, updatedBy: request.auth.uid, ...(action === 'update' ? { editHistory: [...(old?.editHistory || []), { editedAt: now, previousData: Object.fromEntries(Object.entries(old).filter(([key]) => !['editHistory', 'updatedAt', 'updatedBy', 'createdAt'].includes(key))) }] } : {}) } : null
      if (ready(state)) {
        if (kind === 'movement') {
          const ids = [...new Set([old, next].filter(Boolean).map(movementBucketId))]
          const refs = ids.map((key) => bucketRef(db, state.generation, 'movements', key))
          const snapshots = await Promise.all(refs.map((entry) => tx.get(entry)))
          const changes = new Map(snapshots.map((entry, i) => [ids[i], entry.data()]))
          if (old) changes.set(movementBucketId(old), applyMovementToBucket(changes.get(movementBucketId(old)), old, -1))
          if (next) changes.set(movementBucketId(next), applyMovementToBucket(changes.get(movementBucketId(next)), next, 1))
          refs.forEach((entry, i) => { const bucket = changes.get(ids[i]); if (bucket.count < 0) throw new HttpsError('failed-precondition', 'Palettenkonten müssen neu aufgebaut werden.'); if (bucket.count === 0) tx.delete(entry); else tx.set(entry, bucket) })
        } else {
          const ids = [...new Set([old?.partnerId, next?.partnerId].filter(Boolean))]
          const reads = await Promise.all(ids.map(async (partnerId) => ({ partnerId, ref: bucketRef(db, state.generation, 'closings', partnerId), summary: await tx.get(bucketRef(db, state.generation, 'closings', partnerId)), latest: await tx.get(db.collection(collection).where('partnerId', '==', partnerId).orderBy('date', 'desc').orderBy('createdAt', 'desc').orderBy('__name__', 'desc').limit(2)) })))
          for (const entry of reads) {
            const candidates = entry.latest.docs.filter((item) => item.id !== id).map((item) => closingInfo(item.id, item.data()))
            if (next?.partnerId === entry.partnerId) candidates.push(closingInfo(id, next))
            candidates.sort(compareClosings)
            tx.set(entry.ref, { partnerId: entry.partnerId, adjustmentSum: numeric(entry.summary.data()?.adjustmentSum) - (old?.partnerId === entry.partnerId ? numeric(old.adjustment) : 0) + (next?.partnerId === entry.partnerId ? numeric(next.adjustment) : 0), latestClosing: candidates.at(-1) || null })
          }
        }
      }
      if (next) tx.set(ref, next); else tx.delete(ref)
      tx.set(receiptRef, { signature, recordId: id, createdAt: now })
      return { id }
    })
  } catch (error) {
    if (!(error instanceof HttpsError)) await recordDiagnostic({ module: 'pallets', stage: 'save', code: 'pallet_save_failed', message: 'Palettenbuchung konnte nicht gespeichert werden.', actorId: request.auth.uid, recordId: id }, db)
    throw error
  }
}

export async function listPalletAccountSummariesHandler(request, { db = getFirestore(), authorize = requireActiveProfile } = {}) {
  const profile = await authorize(request); requirePalletAccess(profile)
  try {
    return await db.runTransaction(async (tx) => {
      const state = (await tx.get(db.doc(PALLET_SUMMARY_STATE))).data()
      const partners = (await tx.get(db.collection('businessPartners'))).docs.map((entry) => ({ id: entry.id, ...entry.data() }))
      let buckets, closings, mode
      if (ready(state)) {
        const [movementSnapshot, closingSnapshot] = await Promise.all([tx.get(db.collection(`palletSummaryGenerations/${state.generation}/movements`)), tx.get(db.collection(`palletSummaryGenerations/${state.generation}/closings`))])
        buckets = movementSnapshot.docs.map((entry) => entry.data()); closings = closingSnapshot.docs.map((entry) => entry.data()); mode = 'summaries'
      } else {
        // Explicit compatibility mode during preparation; never show incomplete sums.
        const [movementSnapshot, closingSnapshot] = await Promise.all([tx.get(db.collection('palletMovements')), tx.get(db.collection('palletClosings'))])
        const byBucket = new Map(), byPartner = new Map()
        movementSnapshot.docs.forEach((entry) => { const movement = entry.data(), key = movementBucketId(movement); byBucket.set(key, applyMovementToBucket(byBucket.get(key), movement, 1)) })
        closingSnapshot.docs.forEach((entry) => { const closing = entry.data(), old = byPartner.get(closing.partnerId) || { partnerId: closing.partnerId, adjustmentSum: 0, latestClosing: null }, info = closingInfo(entry.id, closing); old.adjustmentSum += numeric(closing.adjustment); if (!old.latestClosing || compareClosings(old.latestClosing, info) < 0) old.latestClosing = info; byPartner.set(closing.partnerId, old) })
        buckets = [...byBucket.values()]; closings = [...byPartner.values()]; mode = 'legacy'
      }
      const clusters = indexPartnerClusters(partners)
      return { mode, accounts: partners.filter((partner) => !partner.mergedIntoPartnerId).map((partner) => ({ partner, account: accountFromBuckets(buckets, closings, (clusters.get(partner.id) || []).map((member) => member.id)) })) }
    })
  } catch (error) {
    if (!(error instanceof HttpsError)) await recordDiagnostic({ module: 'pallets', stage: 'load', code: 'pallet_summary_load_failed', message: 'Palettenkontoübersicht konnte nicht geladen werden.', actorId: request.auth.uid }, db)
    throw error
  }
}

/** One bounded transaction per call. Resume after crashes; source mutations are locked
 * while building so the generation is published only after a complete consistent scan. */
export async function rebuildPalletSummariesHandler(request, { db = getFirestore(), authorize = requireActiveProfile } = {}) {
  requireRole(await authorize(request), ['superadmin'], 'Nur Superadmins dürfen Palettenkonten aufbauen.')
  try {
    return await db.runTransaction(async (tx) => {
      const ref = db.doc(PALLET_SUMMARY_STATE), snapshot = await tx.get(ref)
      let state = snapshot.data()
      if (ready(state) && request.data?.restart !== true) return { complete: true }
      if (state?.status !== 'building') state = { version: VERSION, status: 'building', generation: db.collection('palletSummaryGenerations').doc().id, stage: 'palletMovements', cursor: null }
      let query = db.collection(state.stage).orderBy('__name__').limit(100)
      if (state.cursor) query = query.startAfter(state.cursor)
      const page = await tx.get(query), writes = []
      const groups = new Map()
      for (const document of page.docs) {
        const data = document.data(), key = state.stage === 'palletMovements' ? movementBucketId(data) : data.partnerId
        if (!key) continue
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push({ id: document.id, data, ref: document.ref })
      }
      const loaded = await Promise.all([...groups].map(async ([key, entries]) => { const target = bucketRef(db, state.generation, state.stage === 'palletMovements' ? 'movements' : 'closings', key); return { target, entries, data: (await tx.get(target)).data() } }))
      for (const group of loaded) {
        let value = group.data
        for (const { id, data, ref: source } of group.entries) {
          if (state.stage === 'palletMovements') { value = applyMovementToBucket(value, data, 1); writes.push([source, { tourNumberKey: palletTourNumberKey(data.tourNumber) }]) }
          else { value = value || { partnerId: data.partnerId, adjustmentSum: 0, latestClosing: null }; value.adjustmentSum += numeric(data.adjustment); const info = closingInfo(id, data); if (!value.latestClosing || compareClosings(value.latestClosing, info) < 0) value.latestClosing = info; if (!(data.createdAt instanceof Timestamp)) writes.push([source, { createdAt: Timestamp.fromMillis(0) }]) }
        }
        tx.set(group.target, value)
      }
      writes.forEach(([target, value]) => tx.set(target, value, { merge: true }))
      if (page.size < 100) { if (state.stage === 'palletMovements') state = { ...state, stage: 'palletClosings', cursor: null }; else state = { ...state, status: 'ready', tourCoverage: true } }
      else state = { ...state, cursor: page.docs.at(-1).id }
      tx.set(ref, { ...state, updatedAt: FieldValue.serverTimestamp() })
      return { complete: state.status === 'ready', processed: page.size, stage: state.stage }
    })
  } catch (error) { if (!(error instanceof HttpsError)) await recordDiagnostic({ module: 'pallets', stage: 'rebuild', code: 'pallet_rebuild_failed', message: 'Palettenkonten konnten nicht aufgebaut werden.', actorId: request.auth.uid }, db); throw error }
}

export async function listTransportOrderPalletMovementsHandler(request, { db = getFirestore(), authorize = requireActiveProfile } = {}) {
  const profile = await authorize(request); requirePalletAccess(profile)
  if (profile.role !== 'superadmin' && !['view', 'edit'].includes(profile.permissions?.transportOrders)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Transportaufträge.')
  const orderId = request.data?.orderId
  if (typeof orderId !== 'string' || !orderId || orderId.length > 240 || orderId.includes('/')) throw new HttpsError('invalid-argument', 'Ungültiger Transportauftrag.')
  const order = await db.doc(`transportOrders/${orderId}`).get()
  if (!order.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
  const tourNumber = palletTourNumberKey(order.data().externalNumber)
  if (!tourNumber) return { movements: [], mode: 'empty' }
  const state = (await db.doc(PALLET_SUMMARY_STATE).get()).data()
  const indexed = ready(state) && state.tourCoverage === true
  const snapshot = await (indexed ? db.collection('palletMovements').where('tourNumberKey', '==', tourNumber) : db.collection('palletMovements')).get()
  return { movements: snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).filter((entry) => palletTourNumberKey(entry.tourNumber) === tourNumber), mode: indexed ? 'indexed' : 'legacy' }
}
