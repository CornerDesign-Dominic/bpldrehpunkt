import { Timestamp } from 'firebase/firestore'

// Callables serialize Admin SDK timestamps as JSON. Restore the value type used
// by the existing Firestore list/detail calculations, including nanoseconds.
export function reviveCallableFirestoreValues(value) {
  if (Array.isArray(value)) return value.map(reviveCallableFirestoreValues)
  if (!value || typeof value !== 'object' || value instanceof Timestamp) return value
  const keys = Object.keys(value)
  const seconds = value.seconds ?? value._seconds
  const nanoseconds = value.nanoseconds ?? value._nanoseconds
  if (keys.length === 2 && Number.isInteger(seconds) && Number.isInteger(nanoseconds) && nanoseconds >= 0 && nanoseconds < 1e9 && keys.every((key) => ['seconds', 'nanoseconds', '_seconds', '_nanoseconds'].includes(key))) return new Timestamp(seconds, nanoseconds)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveCallableFirestoreValues(item)]))
}
