import { fetchDycosMasterDataHandler } from './dycosMasterData.js'
import { hasDycosMasterDataAccess } from './dycosPartnerData.js'
import { resolvePartner } from './dycosTransportOrders.js'
import { mailboxOrderCustomerIdentity, mailboxOrderPlaceholderNumber } from './shared/mailboxOrderCustomerIdentity.js'
import { createHash, randomUUID } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'
import { mailboxCustomerSearchCriteria, mailboxCustomerSearchKey } from './shared/mailboxCustomerSearch.js'
import { fetchDycosFlowCustomerSearch, fetchDycosFlowPartner } from './dycosFlowClient.js'

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
export async function searchMailboxOrderCustomers({ db, context, data, fetchMatches, assignCustomer = assignMailboxOrderCustomer, now = Date.now() }) {
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
    if (result.status === 'found' && result.matches.length === 1 && result.matches[0].number !== mailboxOrderPlaceholderNumber) {
      try {
        result.assignment = await assignCustomer({ db, context, data: { ...data, customerSearchId: result.searchId, customerSourceId: result.matches[0].sourceId }, now })
      } catch (error) {
        result.assignmentError = { code: error instanceof HttpsError ? error.code : 'unavailable', message: error instanceof HttpsError ? error.message : 'Der Kunde konnte nicht in Drehpunkt übernommen werden. Bitte erneut versuchen.' }
      }
    }
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


// A direct match is assigned only after the canonical master-data import has
// succeeded. No client-provided company/address fields are written to master data.
export async function assignMailboxOrderCustomer({ db, context, data, fetchPartner = fetchDycosFlowPartner, importCustomer = fetchDycosMasterDataHandler, now = Date.now() }) {
  if (!/^[a-f0-9-]{36}$/.test(data?.previewId || '') || !sqlId(data.customerSourceId)) fail('invalid-argument', 'Bitte einen gültigen DyCoS-Kundentreffer auswählen.')
  const ref = db.doc(`mailboxOrderPreviews/${data.previewId}`)
  async function checked(tx) {
    const snapshot = await tx.get(ref), preview = snapshot.data()
    assertCustomerSearchPreview(preview, context, data, now)
    const proof = confirmedCustomerSearch(preview, data, data.order, now)
    const match = proof.matches.find(item => item.sourceId === data.customerSourceId)
    if (proof.status !== 'found' || !match || match.number === mailboxOrderPlaceholderNumber) fail('failed-precondition', 'Bitte einen aktuellen echten DyCoS-Kundentreffer auswählen.')
    const [connection, user] = await Promise.all([tx.get(context.ref || db.doc(`mailboxConnections/${context.connectionId}`)), tx.get(db.doc(`users/${context.uid}`))])
    const profile = user.data()
    const edit = module => profile?.role === 'superadmin' || profile?.permissions?.[module] === 'edit'
    if (profile?.active !== true || !edit('mailboxes') || !edit('transportOrders') || !(profile.role === 'superadmin' || ['view', 'edit'].includes(profile.permissions?.masterData)) || connection.data()?.ownerId !== context.uid || connection.data()?.status !== 'connected') fail('permission-denied', 'Die Berechtigung oder Postfachverbindung ist nicht mehr verfügbar.')
    if (preview.actionSlotPath) {
      const action = (await tx.get(db.doc(preview.actionSlotPath))).data()
      if (action?.jobId !== preview.actionJobId || action.state !== 'review') fail('aborted', 'Die Auftragsauswertung wurde verworfen oder ersetzt.')
    }
    return { preview, match, profile }
  }
  const initial = await db.runTransaction(checked)
  let imported
  if (!hasDycosMasterDataAccess(initial.profile)) {
    const existing = await db.runTransaction(async tx => {
      const current = await checked(tx)
      const partner = await resolvePartner(tx, db, 'debtor', current.match.number)
      if (mailboxOrderCustomerIdentity(partner, current.match.number)?.sourceId !== current.match.sourceId) fail('permission-denied', 'Für die Anlage oder Ergänzung des Kunden in Drehpunkt werden Stammdaten-Bearbeitungsrechte benötigt.')
      return partner
    })
    imported = { partnerId: existing.id, status: 'unchanged', conflicts: 0 }
  } else {
    const requestId = createHash('sha256').update(`mailbox-customer|${data.previewId}|${data.customerSearchId}|${data.customerSourceId}`).digest('hex')
    imported = await importCustomer({ auth: { uid: context.uid }, data: { typ: 'kunde', nummer: initial.match.number, requestId } }, {
      db, requireProfile: async () => initial.profile, verify: checked,
      fetchPartner: async request => {
        const payload = await fetchPartner(request)
        if (String(payload?.partner?.ID) !== initial.match.sourceId || String(payload?.partner?.Debitorennummer) !== initial.match.number) fail('failed-precondition', 'Die DyCoS-Kundenzuordnung hat sich geändert. Bitte erneut suchen.')
        const criteria = mailboxCustomerSearchCriteria(data.order)
        if (criteria.vatId && payload.partner.USTID && normalize(payload.partner.USTID) !== normalize(criteria.vatId)) fail('failed-precondition', 'Die USt-ID des DyCoS-Kunden widerspricht den Suchangaben. Bitte erneut prüfen.')
        if (initial.preview.customerSearch.basis === 'location' && (normalize(payload.partner.PLZ) !== normalize(criteria.postalCode) || normalize(payload.partner.Ort) !== normalize(criteria.city))) fail('failed-precondition', 'Die DyCoS-Adresse hat sich seit der Suche geändert. Bitte erneut prüfen.')
        return payload
      },
    })
  }
  return db.runTransaction(async tx => {
    const current = await checked(tx)
    const snapshot = await tx.get(db.doc(`businessPartners/${imported.partnerId}`)), partner = snapshot.data()
    if (!snapshot.exists || mailboxOrderCustomerIdentity(partner, current.match.number)?.sourceId !== current.match.sourceId) fail('failed-precondition', 'Der übernommene Kunde besitzt keine passende verifizierte DyCoS-Zuordnung.')
    const assignment = {
      partnerId: imported.partnerId, number: current.match.number, sourceId: current.match.sourceId, searchId: data.customerSearchId,
      status: imported.status, conflicts: imported.conflicts || 0,
      customer: { id: imported.partnerId, companyName: partner.companyName || current.match.name, debtorNumber: partner.debtorNumber || current.match.number,
        dycosReferences: { debtorNumbers: [current.match.number], accounts: [{ entity: 'customer', number: current.match.number, sourceId: current.match.sourceId }] },
        dycosImport: { sourceReferences: [{ entity: 'customer', id: current.match.sourceId }] },
        companyData: { vatId: partner.companyData?.vatId || '' }, address: { postalCode: partner.address?.postalCode || '', city: partner.address?.city || '' } },
    }
    tx.update(ref, { customerSearch: { ...current.preview.customerSearch, assignment } })
    return assignment
  })
}
