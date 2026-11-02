import test from 'node:test'
import assert from 'node:assert/strict'
import { Timestamp } from 'firebase/firestore'
import { reviveCallableFirestoreValues } from './firestoreCallableValues.js'

test('callable Firestore timestamps retain nanoseconds and same-date movement ordering', () => {
  const values = reviveCallableFirestoreValues({ movements: [{ createdAt: { _seconds: 1000, _nanoseconds: 1000000 } }, { createdAt: { seconds: 1000, nanoseconds: 2000000 } }] })
  assert.ok(values.movements[0].createdAt instanceof Timestamp)
  assert.equal(values.movements[1].createdAt.toMillis() - values.movements[0].createdAt.toMillis(), 1)
  assert.deepEqual(reviveCallableFirestoreValues({ seconds: 1, nanoseconds: 0, note: 'ordinary business object' }), { seconds: 1, nanoseconds: 0, note: 'ordinary business object' })
})
