import { createHash } from 'node:crypto'
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { canReadAllOrderImports, hasOrderImportAccess, importPermission } from './dycosImportAccess.js'

const text = value => typeof value === 'string' ? value.trim() : ''
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value)
const successful = new Set(['Neu', 'Aktualisiert', 'Unverändert'])
const actorName = profile => [text(profile.firstName), text(profile.lastName)].filter(Boolean).join(' ') || text(profile.email) || 'Unbekannt'
const readable = (profile, run, uid) => run.importedByUserId === uid && Boolean(importPermission[run.kind]) && (hasOrderImportAccess(profile, run.kind) || profile?.permissions?.[importPermission[run.kind]] === 'view')

export function validateImportSession(data) {
  if (!validId(data?.runId) || !['single', 'bulk'].includes(data?.kind) || !Array.isArray(data.items) || !data.items.length || data.items.length > (data.kind === 'single' ? 1 : 5000)) throw new HttpsError('invalid-argument', 'Ungültiger Importvorgang.')
  const numbers = new Set(), requests = new Set()
  const items = data.items.map(item => {
    if (typeof item?.taNummer !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(item.taNummer) || Number(item.taNummer) > 2147483647 || !validId(item.requestId) || numbers.has(item.taNummer) || requests.has(item.requestId)
      || item.expectedSourceId != null && (!Number.isInteger(item.expectedSourceId) || item.expectedSourceId < 0 || item.expectedSourceId > 2147483647)
      || data.kind === 'bulk' && item.expectedSourceId == null) throw new HttpsError('invalid-argument', 'Ungültige oder doppelte Auftragsauswahl.')
    numbers.add(item.taNummer); requests.add(item.requestId)
    return { taNummer: item.taNummer, requestId: item.requestId, ...(item.expectedSourceId != null ? { expectedSourceId: item.expectedSourceId } : {}) }
  })
  return { runId: data.runId, kind: data.kind, items }
}

// One manifest per operation. Rows are committed with the orders; no scheduled
// worker or duplicate personal/admin history is needed.
export async function manageTransportOrderImportHandler(request, { db = getFirestore() } = {}) {
  const profile = await requireActiveProfile(request)
  if (request.data?.action === 'discard') {
    if (!validId(request.data.runId)) throw new HttpsError('invalid-argument', 'Ungültiger Importvorgang.')
    return db.runTransaction(async tx => {
      const ref = db.doc(`transportOrderImportRuns/${request.data.runId}`)
      const [run, current] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${request.auth.uid}`))])
      if (!run.exists) return { runId: ref.id }
      if (current.get('active') !== true || !run.exists || run.get('importedByUserId') !== request.auth.uid || !hasOrderImportAccess(current.data(), run.get('kind'))) throw new HttpsError('permission-denied', 'Kein Zugriff auf diesen Importvorgang.')
      if (run.get('status') !== 'completed') tx.update(ref, { status: 'cancelled', updatedAt: FieldValue.serverTimestamp() })
      return { runId: ref.id }
    })
  }
  if (request.data?.action !== 'start') throw new HttpsError('invalid-argument', 'Ungültige Importaktion.')
  const data = validateImportSession(request.data)
  if (!hasOrderImportAccess(profile, data.kind)) throw new HttpsError('permission-denied', 'Keine Berechtigung für diese Importart.')
  const manifestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  return db.runTransaction(async tx => {
    const ref = db.doc(`transportOrderImportRuns/${data.runId}`), activeRef = db.doc(`dycosImportSessions/${request.auth.uid}`)
    const [run, active, current] = await Promise.all([tx.get(ref), tx.get(activeRef), tx.get(db.doc(`users/${request.auth.uid}`))])
    if (current.get('active') !== true || !hasOrderImportAccess(current.data(), data.kind)) throw new HttpsError('permission-denied', 'Die Importberechtigung wurde inzwischen geändert.')
    if (run.exists) {
      if (run.get('importedByUserId') !== request.auth.uid || run.get('manifestHash') !== manifestHash || run.get('status') === 'cancelled') throw new HttpsError('failed-precondition', 'Der Importvorgang stimmt nicht mit der gespeicherten Auswahl überein.')
      return { runId: ref.id }
    }
    if (active.exists && active.get('runId') !== data.runId) {
      const previous = await tx.get(db.doc(`transportOrderImportRuns/${active.get('runId')}`))
      if (previous.exists && !['completed', 'cancelled'].includes(previous.get('status'))) {
        if (hasOrderImportAccess(current.data(), previous.get('kind'))) throw new HttpsError('failed-precondition', 'Es besteht bereits ein offener Import. Bitte diesen im Importverlauf fortsetzen oder beenden.', { runId: previous.id, kind: previous.get('kind') })
        // Stop a revoked import without blocking another type the owner may use.
        tx.update(previous.ref, { status: 'cancelled', endedReason: 'permission-revoked', updatedAt: FieldValue.serverTimestamp() })
      }
    }
    const selectionChunks = Math.ceil(data.items.length / 100)
    tx.create(ref, { id: ref.id, kind: data.kind, selectionChunks, manifestHash, total: data.items.length, processed: 0, counts: {}, status: 'running', source: 'dycos-api', externalNumber: data.kind === 'single' ? data.items[0].taNummer : '', importedByUserId: request.auth.uid, importedByName: actorName(current.data()), importedAt: FieldValue.serverTimestamp() })
    for (let index = 0; index < selectionChunks; index++) tx.create(ref.collection('selection').doc(String(index).padStart(2, '0')), { index, items: data.items.slice(index * 100, (index + 1) * 100) })
    tx.set(activeRef, { runId: ref.id })
    return { runId: ref.id }
  })
}

export async function readImportSession(tx, db, data, uid, profile) {
  if (!data.importRunId) return null
  const ref = db.doc(`transportOrderImportRuns/${data.importRunId}`)
  const [run, row, selection] = await Promise.all([tx.get(ref), tx.get(ref.collection('rows').doc(data.requestId)), tx.get(ref.collection('selection').doc(String(Math.floor(data.selectionIndex / 100)).padStart(2, '0')))])
  const item = selection.get('items')?.[data.selectionIndex % 100]
  if (!run.exists || run.get('importedByUserId') !== uid || !hasOrderImportAccess(profile, run.get('kind')) || run.get('status') === 'cancelled') throw new HttpsError('permission-denied', 'Kein Zugriff auf diesen Importvorgang.')
  if (!item || data.selectionIndex >= run.get('total') || item.requestId !== data.requestId || item.taNummer !== data.taNummer || (item.expectedSourceId ?? null) !== (data.expectedSourceId ?? null)) throw new HttpsError('failed-precondition', 'Der Auftrag gehört nicht zur gespeicherten Auswahl.')
  return { run, row, rowNumber: data.selectionIndex + 1 }
}

export function writeImportSessionRow(tx, session, row) {
  const previous = session.row.data(), counts = { ...session.run.get('counts') }
  if (previous?.status) counts[previous.status] = Math.max(0, (counts[previous.status] || 0) - 1)
  counts[row.status] = (counts[row.status] || 0) + 1
  const processed = (session.run.get('processed') || 0) + (session.row.exists ? 0 : 1)
  const status = processed === session.run.get('total') ? (counts.Fehlerhaft ? 'partial' : 'completed') : 'running'
  tx.set(session.row.ref, { ...row, rowNumber: session.rowNumber })
  tx.update(session.run.ref, { counts, processed, status, updatedAt: FieldValue.serverTimestamp() })
}

export async function recordImportSessionFailure(db, request, data, message) {
  if (!data.importRunId) return
  await db.runTransaction(async tx => {
    const current = await tx.get(db.doc(`users/${request.auth.uid}`))
    if (current.get('active') !== true) return
    const session = await readImportSession(tx, db, data, request.auth.uid, current.data())
    if (successful.has(session.row.get('status'))) return
    writeImportSessionRow(tx, session, { externalNumber: data.taNummer, status: 'Fehlerhaft', errors: [message], createdAt: FieldValue.serverTimestamp() })
  })
}

function summary(snapshot) {
  const data = snapshot.data()
  return { id: snapshot.id, kind: data.kind || (data.source === 'dycos-api' ? 'single' : 'legacy'), source: text(data.source), fileName: text(data.fileName), externalNumber: text(data.externalNumber), importedAt: data.importedAt?.toMillis?.() || null, importedByName: text(data.importedByName), status: data.status || 'completed', total: data.total || 1, counts: data.counts || {} }
}

export async function listTransportOrderImportRunsHandler(request, { db = getFirestore() } = {}) {
  const profile = await requireActiveProfile(request), all = request.data?.scope === 'all', kind = request.data?.kind
  if (all ? !canReadAllOrderImports(profile) : !['single', 'bulk'].includes(kind) || !(hasOrderImportAccess(profile, kind) || profile.permissions?.[importPermission[kind]] === 'view')) throw new HttpsError('permission-denied', 'Keine Berechtigung für diesen Importverlauf.')
  const runId = text(request.data?.runId)
  if (runId) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId)) throw new HttpsError('invalid-argument', 'Ungültiger Importvorgang.')
    const run = await db.doc(`transportOrderImportRuns/${runId}`).get()
    if (!run.exists) throw new HttpsError('not-found', 'Dieser Importlauf wurde nicht gefunden.')
    if (!all && (!readable(profile, run.data(), request.auth.uid) || run.get('kind') !== kind)) throw new HttpsError('permission-denied', 'Kein Zugriff auf diesen Importvorgang.')
    const [rows, chunks] = await Promise.all([run.ref.collection('rows').orderBy('rowNumber', 'asc').limit(5000).get(), run.get('selectionChunks') ? run.ref.collection('selection').orderBy('index').limit(50).get() : null])
    const items = chunks ? chunks.docs.flatMap(chunk => chunk.get('items')) : null
    const byRequest = new Map(rows.docs.map(row => [row.id, { id: row.id, ...row.data(), createdAt: row.get('createdAt')?.toMillis?.() || null }]))
    return { run: summary(run), rows: items ? items.map((item, index) => byRequest.get(item.requestId) || { id: item.requestId, rowNumber: index + 1, externalNumber: item.taNummer, status: run.get('status') === 'cancelled' ? 'Nicht importiert' : 'Ausstehend' }) : [...byRequest.values()],
      ...(items && run.get('importedByUserId') === request.auth.uid && !['completed', 'cancelled'].includes(run.get('status')) && hasOrderImportAccess(profile, run.get('kind')) ? { resume: { runId: run.id, kind: run.get('kind'), items } } : {}) }
  }
  let query = db.collection('transportOrderImportRuns')
  if (!all) query = query.where('importedByUserId', '==', request.auth.uid).where('kind', '==', kind)
  query = query.orderBy('importedAt', 'desc').orderBy(FieldPath.documentId(), 'desc')
  if (request.data?.cursor) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(request.data.cursor)) throw new HttpsError('invalid-argument', 'Ungültige Verlaufsseite.')
    const cursor = await db.doc(`transportOrderImportRuns/${request.data.cursor}`).get()
    if (!cursor.exists || !all && (!readable(profile, cursor.data(), request.auth.uid) || cursor.get('kind') !== kind)) throw new HttpsError('permission-denied', 'Ungültige Verlaufsseite.')
    query = query.startAfter(cursor)
  }
  const runs = await query.limit(25).get()
  return { runs: runs.docs.map(summary), cursor: runs.docs.at(-1)?.id || null, hasMore: runs.size === 25 }
}
