import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { loadSystemCalendarSources, validateSystemCalendarQuery } from './calendarQueries.js'
import { listTransportOrdersPageHandler, loadTransportOrderRelations } from './transportOrderList.js'
import { refreshTransportOrderListProjection, transportOrderListProjection, transportOrderListProjectionState, transportOrderRelationId, transportOrderRelationsCollection, transportOrderRelationMembersCollection } from './transportOrderListProjection.js'

test('real emulator: date-scoped calendar sources and indexed transport pagination retain legacy results', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = `demo-cost-query-${randomUUID().slice(0, 8)}`
  const app = initializeApp({ projectId })
  const db = getFirestore(app)
  async function seed(path, value) { await db.doc(path).set(value) }
  try {
    await seed('damageCases/calendar-damage', { caseNumber: 'COST-1', title: 'Fixture', privateAmount: 9999 })
    await seed('damageCases/calendar-damage/deadlines/start', { date: '2098-01-01', note: 'start', reminderRecipientEmail: 'private@example.invalid' })
    await seed('damageCases/calendar-damage/deadlines/end', { date: '2098-01-31', note: 'end' })
    await seed('todos/private/deadlines/not-a-case', { date: '2098-01-10', note: 'private todo' })
    for (let index = 0; index < 140; index += 1) await seed(`damageCases/calendar-damage/deadlines/future-${String(index).padStart(3, '0')}`, { date: new Date(Date.UTC(2098, 1, index + 1)).toISOString().slice(0, 10), note: `future ${index}` })
    for (let index = 0; index < 11; index += 1) await seed(`insolvencies/archived-${index}`, { splitArchivedAt: Timestamp.now(), insolvencyDate: `2098-02-${String(index + 1).padStart(2, '0')}` })
    await seed('insolvencies/visible', { partnerName: 'Visible', insolvencyDate: '2098-02-20' })
    await seed('insolvencies/visible/deadlines/split-archive', { date: '2098-01-12', splitArchivedAt: Timestamp.now() })
    const sources = await loadSystemCalendarSources(db, validateSystemCalendarQuery({ from: '2098-01-01', until: '2098-01-31', upcomingFrom: '2098-02-01', calendarIds: ['system-damages', 'system-insolvencies'] }, { permissions: { damages: 'view', insolvencies: 'view' } }))
    assert.ok(sources.deadlines.some((item) => item.id === 'start'))
    assert.ok(sources.deadlines.some((item) => item.id === 'end'))
    assert.equal(sources.deadlines.length, 102, 'one empty selected deadline source must not force reading all 140 future deadlines')
    assert.ok(sources.deadlines.every((item) => item.parentPath.startsWith('damageCases/')))
    assert.equal(sources.cases.damageCases[0].privateAmount, undefined)
    assert.equal(sources.deadlines.find((item) => item.id === 'start').reminderRecipientEmail, undefined)
    assert.deepEqual(sources.cases.insolvencies.map((item) => item.id), ['visible'])

    await seed('users/cost-query-user', { active: true, permissions: { transportOrders: 'view' } })
    for (let index = 0; index < 57; index += 1) {
      const imported = { relation: index % 7 ? '  Match  ' : 'Other', loading: { window: { from: index % 2 ? '2098-01-15T10:00' : Timestamp.fromDate(new Date('2098-01-15T10:00:00Z')) } } }
      await seed(`transportOrders/order-${String(index).padStart(3, '0')}`, { externalNumber: String(100000000 + index), imported, listQuery: transportOrderListProjection({ imported }), importMeta: { lastImportedAt: Timestamp.now() } })
    }
    const request = { auth: { uid: 'cost-query-user' }, data: { relation: 'Match', loadingFrom: '2098-01-01', loadingUntil: '2098-01-31', sort: { key: 'externalNumber', direction: 'asc' }, pageSize: 25 } }
    await seed(transportOrderListProjectionState, { complete: false })
    const legacy = await listTransportOrdersPageHandler(request)
    assert.deepEqual(await loadTransportOrderRelations(db), { relations: ['Match', 'Other'], mode: 'legacy' })
    for (let index = 0; index < 57; index += 1) {
      const id = `order-${String(index).padStart(3, '0')}`
      await refreshTransportOrderListProjection(db, id)
    }
    assert.equal((await db.collection(transportOrderRelationMembersCollection).get()).size, 57)
    // A finished v1 deployment must not accidentally authorize an incomplete
    // v2 catalog. The new generation alone enables indexed relations/queries.
    await seed('backgroundWorkState/transport-order-list-v1', { complete: true })
    await seed('backgroundWorkState/transport-order-list-v2', { complete: true })
    assert.equal((await loadTransportOrderRelations(db)).mode, 'legacy')
    await db.doc(transportOrderListProjectionState).set({ complete: true })
    const indexed = await listTransportOrdersPageHandler(request)
    assert.deepEqual(indexed.orders.map((item) => item.id), legacy.orders.map((item) => item.id))
    assert.equal(indexed.hasMore, true)
    assert.equal(indexed.nextCursor, legacy.nextCursor)
    const second = await listTransportOrdersPageHandler({ ...request, data: { ...request.data, cursor: indexed.nextCursor } })
    assert.equal(second.hasMore, false)
    assert.equal(second.orders.length, 23)
    assert.equal(new Set([...indexed.orders, ...second.orders].map((item) => item.id)).size, 48)
    assert.deepEqual(await loadTransportOrderRelations(db), { relations: ['Match', 'Other'], mode: 'indexed' })
    const count = async (relation) => (await db.doc(`${transportOrderRelationsCollection}/${transportOrderRelationId(relation)}`).get()).get('count')
    assert.equal(await count('Match'), 48)
    await db.doc('transportOrders/order-001').update({ 'imported.relation': '  Renamed ' })
    // Wait for both invocations before asserting or cleaning fixtures. A
    // rejected Promise.all would otherwise delete data while its sibling's
    // transaction is still live, obscuring the original concurrency failure.
    const parallel = await Promise.allSettled([refreshTransportOrderListProjection(db, 'order-001'), refreshTransportOrderListProjection(db, 'order-001')])
    for (const result of parallel) if (result.status === 'rejected') throw result.reason
    assert.equal(await count('Match'), 47)
    assert.equal(await count('Renamed'), 1)
    assert.deepEqual((await loadTransportOrderRelations(db)).relations, ['Match', 'Other', 'Renamed'])
    await db.doc('transportOrders/order-001').delete()
    await refreshTransportOrderListProjection(db, 'order-001')
    await refreshTransportOrderListProjection(db, 'order-001')
    assert.equal(await count('Renamed'), undefined)
    assert.equal(await count('Match'), 47)
    assert.deepEqual((await loadTransportOrderRelations(db)).relations, ['Match', 'Other'])

    const imported = { relation: 'Match', loading: { window: { from: '2098-1' } } }
    await seed('transportOrders/legacy-malformed-date', { externalNumber: '999999999', imported, listQuery: transportOrderListProjection({ imported }), importMeta: { lastImportedAt: Timestamp.now() } })
    await refreshTransportOrderListProjection(db, 'legacy-malformed-date')
    const malformedRequest = { ...request, data: { ...request.data, search: '999999999', loadingUntil: '2098-12-31' } }
    await db.doc(transportOrderListProjectionState).set({ complete: false })
    const oldMalformed = await listTransportOrdersPageHandler(malformedRequest)
    await db.doc(transportOrderListProjectionState).set({ complete: true })
    const indexedMalformed = await listTransportOrdersPageHandler(malformedRequest)
    assert.deepEqual(indexedMalformed.orders.map((item) => item.id), oldMalformed.orders.map((item) => item.id))
    assert.deepEqual(indexedMalformed.orders.map((item) => item.id), ['legacy-malformed-date'])

    // The first explicit sort is also an inequality field. Earlier-started,
    // still-running events must remain ahead of later upcoming appointments.
    await seed('calendars/calendar-test/events/ongoing', { startDate: '2097-01-01', endDate: '2098-03-01' })
    await seed('calendars/calendar-test/events/future', { startDate: '2098-02-01', endDate: '2098-02-01' })
    await seed('calendars/calendar-test/events/ended', { startDate: '2097-01-01', endDate: '2097-01-02' })
    const upcoming = await db.collection('calendars/calendar-test/events').where('startDate', '>=', '').where('endDate', '>=', '2098-01-01').orderBy('startDate').get()
    assert.deepEqual(upcoming.docs.map((item) => item.id), ['ongoing', 'future'])

    for (let index = 0; index < 11; index += 1) await seed(`inkassoCases/malformed-upcoming-${index}`, { originalDueDate: '3000-1' })
    await seed('inkassoCases/real-upcoming', { originalDueDate: '3001-01-01', caseNumber: 'REAL' })
    const validUpcoming = await loadSystemCalendarSources(db, validateSystemCalendarQuery({ from: '2999-01-01', until: '2999-01-31', upcomingFrom: '3000-01-01', calendarIds: ['system-inkasso'] }, { permissions: { inkasso: 'view' } }))
    assert.deepEqual(validUpcoming.cases.inkassoCases.map((item) => item.id), ['real-upcoming'], 'historical dates excluded by presentation must not consume the upcoming limit')

    for (const [id, relation] of [['swap-a', 'Counter A'], ['swap-b', 'Counter B']]) {
      await seed(`transportOrders/${id}`, { imported: { relation } })
      await refreshTransportOrderListProjection(db, id)
    }
    for (let turn = 0; turn < 4; turn += 1) {
      const first = turn % 2 ? 'Counter A' : 'Counter B'
      const second = turn % 2 ? 'Counter B' : 'Counter A'
      const patch = db.batch()
      patch.update(db.doc('transportOrders/swap-a'), { 'imported.relation': first })
      patch.update(db.doc('transportOrders/swap-b'), { 'imported.relation': second })
      await patch.commit()
      const swaps = await Promise.allSettled([
        refreshTransportOrderListProjection(db, 'swap-a'), refreshTransportOrderListProjection(db, 'swap-b'),
        refreshTransportOrderListProjection(db, 'swap-a'), refreshTransportOrderListProjection(db, 'swap-b'),
      ])
      for (const result of swaps) if (result.status === 'rejected') throw result.reason
      assert.equal(await count('Counter A'), 1)
      assert.equal(await count('Counter B'), 1)
    }
  } finally {
    try {
      // This unique demo project belongs exclusively to this test. Clear all
      // source, descendant and derived documents, including partial rebuilds
      // from an assertion/transaction failure before receipt registration.
      assert.ok(projectId.startsWith('demo-'))
      const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
      assert.equal(response.status, 200, 'test project cleanup must succeed')
    } finally { await deleteApp(app) }
  }
})
