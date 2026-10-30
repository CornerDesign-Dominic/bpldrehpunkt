import { randomUUID } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'
import { mailboxCustomerSearchCriteria, mailboxCustomerSearchKey } from './shared/mailboxCustomerSearch.js'
import { fetchDycosFlowCustomerSearch } from './dycosFlowClient.js'

const fail = (code, message) => { throw new HttpsError(code, message) }
const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('de-DE').replace(/[\s.,-]/g, '')
const sqlId = value => /^(?:[1-9]\d{0,9})$/.test(String(value)) && Number(value) <= 2147483647
export function checkedCustomerMatches(payload) {
  if (payload?.schemaVersion !== 1 || payload.modus !== 'kundensuche' || !Array.isArray(payload.treffer) || payload.treffer.length > 50 || typeof payload.more !== 'boolean') fail('unavailable', 'Die DyCoS-Suche hat keine verlässliche Trefferliste geliefert.')
  if (payload.more) fail('failed-precondition', 'Zu viele Kunden gefunden. Bitte die Suchangaben präzisieren.')
  const seen = new Set()
  return payload.treffer.map(row => {
    if (!row || !sqlId(row.ID) || !sqlId(row.Debitorennummer) || seen.has(String(row.ID))) fail('unavailable', 'Die DyCoS-Kundenzuordnung ist nicht eindeutig.')
    seen.add(String(row.ID))
    const read = (key, max) => { if (row[key] == null) return ''; if (!['string', 'number'].includes(typeof row[key]) || String(row[key]).length > max) fail('unavailable', 'Ungültige Kundendaten aus DyCoS.'); return String(row[key]).trim() }
    return { sourceId: String(row.ID), number: String(row.Debitorennummer), name: read('Firma', 255), vatId: read('USTID', 40), postalCode: read('PLZ', 40), city: read('Ort', 255), country: read('Land', 40) }
  })
}
export async function findDycosCustomers(criteria, fetchMatches = fetchDycosFlowCustomerSearch) {
  let matches = [], basis = ''
  if (criteria.vatId) { matches = checkedCustomerMatches(await fetchMatches({ ustId: criteria.vatId, plz: '', ort: '' })); basis = 'vat' }
  if (!matches.length && criteria.postalCode && criteria.city) {
    matches = checkedCustomerMatches(await fetchMatches({ ustId: '', plz: criteria.postalCode, ort: criteria.city })); basis = 'location'
    if (criteria.vatId && matches.some(row => row.vatId && normalize(row.vatId) !== normalize(criteria.vatId))) {
      const compatible = matches.filter(row => !row.vatId || normalize(row.vatId) === normalize(criteria.vatId))
      if (!compatible.length) return { status: 'conflict', matches: [], basis }
      matches = compatible
    }
  }
  if (matches.length > 1 && criteria.postalCode && criteria.city) {
    const narrowed = matches.filter(row => normalize(row.postalCode) === normalize(criteria.postalCode) && normalize(row.city) === normalize(criteria.city))
    if (narrowed.length) matches = narrowed
  }
  return { status: matches.length ? 'found' : 'none', matches, basis }
}
export function assertCustomerSearchPreview(preview, context, data, now) {
  if (!preview || preview.ownerId !== context.uid || preview.connectionId !== context.connectionId || preview.graphUserId !== context.connection.graphUserId || preview.messageId !== data.messageId) fail('permission-denied', 'Diese Auftragsvorschau ist nicht verfügbar.')
  if (preview.expiresAt <= now || preview.exportedAt) fail('failed-precondition', 'Bitte eine aktuelle, noch nicht abgeschlossene Auftragsvorschau verwenden.')
}
export async function searchMailboxOrderCustomers({ db, context, data, fetchMatches, now = Date.now() }) {
  if (!/^[a-f0-9-]{36}$/.test(data?.previewId || '') || typeof data.messageId !== 'string') fail('invalid-argument', 'Bitte eine gültige Auftragsvorschau öffnen.')
  let criteria
  try { criteria = mailboxCustomerSearchCriteria(data.order) } catch (error) { fail('invalid-argument', error.message) }
  const ref = db.doc(`mailboxOrderPreviews/${data.previewId}`), quotaRef = db.doc(`mailboxOrderQuotas/customer-search-${context.uid}`)
  const jobId = randomUUID()
  await db.runTransaction(async tx => {
    const [snapshot, quota] = await Promise.all([tx.get(ref), tx.get(quotaRef)])
    assertCustomerSearchPreview(snapshot.data(), context, data, now)
    const last = quota.data()
    if (last?.until > now) fail('resource-exhausted', 'Bitte einen Moment warten und die Kundensuche erneut versuchen.')
    if (snapshot.data().customerSearch?.runningUntil > now) fail('aborted', 'Für diese Vorschau läuft bereits eine Kundensuche.')
    tx.set(quotaRef, { until: now + 10000, expiresAt: now + 86400000 })
    tx.update(ref, { customerSearch: { jobId, criteriaKey: mailboxCustomerSearchKey(data.order), runningUntil: now + 240000 } })
  })
  try {
    const found = await findDycosCustomers(criteria, fetchMatches)
    const result = { ...found, searchId: jobId, criteriaKey: mailboxCustomerSearchKey(data.order), expiresAt: now + 15 * 60000 }
    await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref)
      assertCustomerSearchPreview(snapshot.data(), context, data, now)
      if (snapshot.data().customerSearch?.jobId !== jobId) fail('aborted', 'Die Kundensuche wurde ersetzt. Bitte erneut prüfen.')
      const connection = (await tx.get(context.ref || db.doc(`mailboxConnections/${context.connectionId}`))).data()
      if (connection?.ownerId !== context.uid || connection.status !== 'connected') fail('permission-denied', 'Die Postfachverbindung ist nicht mehr verfügbar.')
      if (snapshot.data().actionSlotPath) {
        const action = (await tx.get(db.doc(snapshot.data().actionSlotPath))).data()
        if (action?.jobId !== snapshot.data().actionJobId || action.state !== 'review') fail('aborted', 'Die Auftragsauswertung wurde verworfen oder ersetzt.')
      }
      tx.update(ref, { customerSearch: { ...result, jobId, runningUntil: 0 } })
    })
    return result
  } catch (error) {
    await db.runTransaction(async tx => { const snapshot = await tx.get(ref); if (snapshot.data()?.customerSearch?.jobId === jobId) tx.update(ref, { customerSearch: { jobId, status: 'failed', runningUntil: 0 } }) }).catch(() => {})
    if (error instanceof HttpsError) throw error
    fail('unavailable', 'Die direkte DyCoS-Suche ist fehlgeschlagen. Bitte erneut prüfen. Der Platzhalter ist noch nicht freigegeben.')
  }
}
export function confirmedCustomerSearch(preview, data, order, now) {
  const proof = preview.customerSearch
  let key
  try { key = mailboxCustomerSearchKey(order) } catch { fail('failed-precondition', 'Bitte zuerst die Auftraggeberangaben direkt in DyCoS prüfen.') }
  if (!proof || proof.searchId !== data.customerSearchId || proof.expiresAt <= now || proof.criteriaKey !== key || !['none', 'found'].includes(proof.status)) fail('failed-precondition', 'Bitte die aktuellen Auftraggeberangaben zuerst direkt in DyCoS prüfen.')
  return proof
}
