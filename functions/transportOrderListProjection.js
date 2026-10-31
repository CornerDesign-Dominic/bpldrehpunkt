import { advanceBackgroundRebuild } from './backgroundWork.js'
import { createHash } from 'node:crypto'

const rebuildName = 'transport-order-list-v3'
export const transportOrderListProjectionState = `backgroundWorkState/${rebuildName}`
export const transportOrderRelationsCollection = 'transportOrderRelationCatalog'
export const transportOrderRelationMembersCollection = 'transportOrderRelationMembers'
export function transportOrderRelationId(relation) { return createHash('sha256').update(relation).digest('hex') }

export function transportOrderListProjection(order) {
  const raw = order?.imported?.loading?.window?.from
  const loadingDate = typeof raw === 'string' ? raw.slice(0, 10) : raw?.toDate ? raw.toDate().toISOString().slice(0, 10) : ''
  // Keep malformed legacy string dates queryable: their previous lexical
  // comparison can still match a user's date range, so never bucket them away.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(loadingDate) ? new Date(`${loadingDate}T00:00:00Z`) : null
  const loadingMonth = parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === loadingDate ? loadingDate.slice(0, 7) : 'legacy'
  return { version: 2, relation: typeof order?.imported?.relation === 'string' ? order.imported.relation.trim() : '', loadingDate, loadingMonth }
}

export async function refreshTransportOrderListProjection(db, orderId) {
  const ref = db.doc(`transportOrders/${orderId}`)
  const memberRef = db.doc(`${transportOrderRelationMembersCollection}/${orderId}`)
  await db.runTransaction(async (transaction) => {
    // Read the current source on every retry, including stale/duplicate delete
    // events. The per-order receipt makes incremental counts idempotent.
    // Acquire locks in a fixed order. A multi-document read can acquire the
    // source/receipt locks concurrently and produce lock-upgrade deadlocks for
    // duplicate invocations, especially with streaming emulator reads.
    const snapshot = await transaction.get(ref)
    const member = await transaction.get(memberRef)
    const projection = snapshot.exists ? transportOrderListProjection(snapshot.data()) : null
    const relation = projection?.relation || ''
    const previous = member.exists ? member.get('relation') : ''
    if (member.exists && (typeof previous !== 'string' || !previous)) throw new Error('Ungültiger Relationsbeleg.')
    if (previous !== relation) {
      const values = [...new Set([previous, relation].filter(Boolean))].sort((left, right) => transportOrderRelationId(left).localeCompare(transportOrderRelationId(right)))
      const refs = values.map((value) => db.doc(`${transportOrderRelationsCollection}/${transportOrderRelationId(value)}`))
      const aggregates = []
      for (const aggregateRef of refs) aggregates.push(await transaction.get(aggregateRef))
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        const aggregate = aggregates[index]
        const count = aggregate.exists ? aggregate.get('count') : 0
        if (!Number.isInteger(count) || count < 0 || (aggregate.exists && aggregate.get('relation') !== value) || (value === previous && count < 1)) throw new Error('Inkonsistentes Relationsverzeichnis.')
        const next = count + (value === relation ? 1 : -1)
        if (next === 0) transaction.delete(refs[index])
        else transaction.set(refs[index], { relation: value, count: next })
      }
      if (relation) transaction.set(memberRef, { relation })
      else if (member.exists) transaction.delete(memberRef)
    }
    if (snapshot.exists && JSON.stringify(snapshot.get('listQuery')) !== JSON.stringify(projection)) transaction.update(ref, { listQuery: projection })
  })
}

export function advanceTransportOrderListProjection(db) {
  return advanceBackgroundRebuild(db, rebuildName, db.collection('transportOrders'), (item) => refreshTransportOrderListProjection(db, item.id))
}
