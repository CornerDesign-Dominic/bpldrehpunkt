import { FieldPath, FieldValue } from 'firebase-admin/firestore'
import { createHash } from 'node:crypto'
import { logger } from 'firebase-functions'
import { recordDiagnostic } from './diagnostics.js'

export const backgroundWorkPageSize = 200

/** Rebuilding is explicit, bounded and resumable. Source triggers and rebuilds
 * both read current documents, never the possibly outdated event payload. */
export async function requestBackgroundRebuild(db, name, requestId = '') {
  const stateRef = db.doc(`backgroundWorkState/${name}`)
  const requestRef = requestId ? db.doc(`backgroundWorkState/rebuild-request-${createHash('sha256').update(`${name}|${requestId}`).digest('hex')}`) : null
  await db.runTransaction(async (transaction) => {
    const [stateSnapshot, requestSnapshot] = await Promise.all([transaction.get(stateRef), requestRef ? transaction.get(requestRef) : null])
    const state = stateSnapshot.data() || {}
    // Remember each event, not only the most recent one: A, B, duplicate A
    // must not restart a rebuild that is already processing current sources.
    if (requestSnapshot?.exists) return
    if (requestRef) transaction.create(requestRef, { kind: 'rebuild-request', name, createdAt: FieldValue.serverTimestamp() })
    if (requestId && state.requestId === requestId) return
    transaction.set(stateRef, { generation: (state.generation || 0) + 1, requestId, cursor: null, complete: false, requestedAt: FieldValue.serverTimestamp() }, { merge: true })
  })
}

export async function advanceBackgroundRebuild(db, name, source, refresh) {
  const stateRef = db.doc(`backgroundWorkState/${name}`)
  const state = (await stateRef.get()).data() || {}
  if (state.complete) return { complete: true, scanned: 0 }
  let query = source.orderBy(FieldPath.documentId()).limit(backgroundWorkPageSize)
  if (state.cursor) query = query.startAfter(db.doc(state.cursor))
  const page = await query.get()
  for (const item of page.docs) await refresh(item)
  const cursor = page.docs.at(-1)?.ref.path || state.cursor || null
  let complete = false
  await db.runTransaction(async (transaction) => {
    const current = (await transaction.get(stateRef)).data() || {}
    // A configuration change or concurrent worker must not lose its restart.
    if ((current.generation || 0) !== (state.generation || 0) || (current.cursor || null) !== (state.cursor || null)) return
    complete = page.size < backgroundWorkPageSize
    transaction.set(stateRef, { generation: state.generation || 0, cursor, complete, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  })
  return { complete, scanned: page.size }
}

export async function reportBackgroundFailure(db, action, error) {
  logger.error('Hintergrundverarbeitung fehlgeschlagen.', { action, code: error?.code || 'unknown' })
  try {
    const marker = db.doc(`backgroundWorkState/error-${action}`)
    const code = String(error?.code || 'background-work-failed').slice(0, 80)
    const report = await db.runTransaction(async (transaction) => {
      const previous = (await transaction.get(marker)).data()
      if (previous?.code === code && previous.reportedAt?.toMillis?.() > Date.now() - 15 * 60 * 1000) return false
      transaction.set(marker, { code, reportedAt: FieldValue.serverTimestamp() })
      return true
    })
    if (report) await recordDiagnostic({ module: 'background-work', stage: action, code, message: 'Hintergrundverarbeitung fehlgeschlagen; der nächste Lauf setzt die ausstehende Arbeit fort.', actorId: 'system', actorName: 'Hintergrundverarbeitung' }, db)
  } catch { logger.warn('Hintergrundfehler konnte nicht zentral erfasst werden.', { action }) }
}

export async function withBackgroundDiagnostic(db, action, operation) {
  try { return await operation() } catch (error) { await reportBackgroundFailure(db, action, error); throw error }
}

export function relevantDocumentChanged(before, after, ignored = []) {
  const selected = (value) => value ? Object.fromEntries(Object.entries(value).filter(([key]) => !ignored.includes(key)).sort(([a], [b]) => a.localeCompare(b))) : null
  return JSON.stringify(selected(before)) !== JSON.stringify(selected(after))
}
