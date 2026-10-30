import { randomUUID } from 'node:crypto'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { fetchDycosFlowSearch } from './dycosFlowClient.js'
import { hasDycosImportAccess } from './dycosTransportOrders.js'
import { DYCOS_EARLIEST_LOADING_DATE, isCalendarDate } from './shared/dycosImportPolicy.js'

const invalid = () => { throw new Error('Invalid DyCoS search response') }
const id = value => Number.isInteger(value) && value >= 0 && value <= 2147483647
const string = (value, max = 4000) => {
  if (value == null) return ''
  if (typeof value !== 'string' || value.length > max) return invalid()
  return value.trim()
}
const rows = (value, max) => {
  if (!Array.isArray(value) || value.length > max || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return invalid()
  return value
}
function indexed(value, max) {
  const result = new Map()
  for (const row of rows(value, max)) {
    if (!id(row.ID) || result.has(row.ID)) return invalid()
    result.set(row.ID, row)
  }
  return result
}

export function validateDycosSearchRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpsError('invalid-argument', 'Ungültige Suchanfrage.')
  if (data.modus === 'relationen') {
    if (Object.keys(data).some(key => key !== 'modus')) throw new HttpsError('invalid-argument', 'Ungültige Relationsanfrage.')
    return { modus: 'relationen' }
  }
  if (Object.keys(data).some(key => !['modus', 'ladeDatumVon', 'ladeDatumBis', 'relationId', 'nachId'].includes(key)) || data.modus && data.modus !== 'suche'
    || !isCalendarDate(data.ladeDatumVon) || !isCalendarDate(data.ladeDatumBis) || data.ladeDatumVon < DYCOS_EARLIEST_LOADING_DATE || data.ladeDatumBis < data.ladeDatumVon
    || data.relationId != null && !id(data.relationId) || data.nachId != null && !id(data.nachId)) throw new HttpsError('invalid-argument', 'Bitte einen gültigen Ladedatumsbereich ab dem 01.01.2026 und eine gültige Relation angeben.')
  return { modus: 'suche', ladeDatumVon: data.ladeDatumVon, ladeDatumBis: data.ladeDatumBis, relationId: data.relationId ?? null, nachId: data.nachId ?? 0 }
}

export function mapDycosRelationOptions(payload) {
  if (payload?.schemaVersion !== 1) return invalid()
  return [...indexed(payload.relationen, 1000).values()].map(row => ({ id: row.ID, label: string(row.Bezeichnung, 300) || String(row.Nummer ?? row.ID) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de', { numeric: true }))
}

export function mapDycosSearchPage(payload, query) {
  if (payload?.schemaVersion !== 1 || payload.pageSize !== 15 || typeof payload.hasMore !== 'boolean') return invalid()
  const orders = rows(payload.auftraege, 15)
  const customers = indexed(payload.kunden, 100), tours = indexed(payload.touren, 100), carriers = indexed(payload.unternehmer, 100), relations = indexed(payload.relationen, 100)
  const ids = new Set(), customerIds = new Set(), tourIds = new Set(), relationIds = new Set()
  let lastId = query.nachId
  for (const row of orders) {
    if (!id(row.ID) || row.ID <= lastId || !id(row.Nummer)) return invalid()
    if (['FrachtzahlerID', 'TourenID', 'RelationsID'].some(field => row[field] != null && !id(row[field]))) return invalid()
    const day = string(row.Ladedatum).slice(0, 10)
    if (!isCalendarDate(day) || day < query.ladeDatumVon || day > query.ladeDatumBis || query.relationId !== null && row.RelationsID !== query.relationId) return invalid()
    ids.add(row.ID); customerIds.add(row.FrachtzahlerID); tourIds.add(row.TourenID); relationIds.add(row.RelationsID); lastId = row.ID
  }
  if ([...customers.keys()].some(key => !customerIds.has(key)) || [...tours.keys()].some(key => !tourIds.has(key)) || [...relations.keys()].some(key => !relationIds.has(key))) return invalid()
  const carrierIds = new Set([...tours.values()].map(row => row.UnternehmerID))
  if ([...tours.values()].some(row => row.UnternehmerID != null && !id(row.UnternehmerID))) return invalid()
  if ([...carriers.keys()].some(key => !carrierIds.has(key))) return invalid()
  const stations = new Map(), stationIds = new Set()
  for (const row of rows(payload.stationen, 1000)) {
    if (!id(row.ID) || stationIds.has(row.ID) || !ids.has(row.AuftragsID)) return invalid()
    stationIds.add(row.ID)
    const entries = stations.get(row.AuftragsID) || []
    entries.push(row); stations.set(row.AuftragsID, entries)
  }
  const station = row => row ? { company: string(row.Firma), city: string(row.Ort), postalCode: string(row.PLZ), country: string(row.Land) } : null
  const mapped = orders.map(row => {
    const stops = (stations.get(row.ID) || []).sort((a, b) => (Number.isFinite(a.Zeile_In_Auftrag) ? a.Zeile_In_Auftrag : Number.MAX_SAFE_INTEGER) - (Number.isFinite(b.Zeile_In_Auftrag) ? b.Zeile_In_Auftrag : Number.MAX_SAFE_INTEGER) || a.ID - b.ID)
    return { sourceId: row.ID, externalNumber: String(row.Nummer), loadingDate: row.Ladedatum.slice(0, 10), relation: string(relations.get(row.RelationsID)?.Bezeichnung, 300),
      customer: string(customers.get(row.FrachtzahlerID)?.Firma), carrier: string(carriers.get(tours.get(row.TourenID)?.UnternehmerID)?.Bezeichnung),
      loading: station(stops.find(stop => string(stop.Lade_Entladestelle).toUpperCase() === 'L')),
      unloading: station(stops.filter(stop => string(stop.Lade_Entladestelle).toUpperCase() === 'E').at(-1)) }
  })
  if (payload.hasMore && (!orders.length || !id(payload.nextNachId) || payload.nextNachId !== lastId)) return invalid()
  return { orders: mapped, hasMore: payload.hasMore, nextCursor: payload.hasMore ? lastId : null }
}

async function claimSearch(db, uid, token) {
  const ref = db.doc(`dycosSearchQuotas/${uid}`)
  await db.runTransaction(async tx => {
    const previous = await tx.get(ref), now = Date.now()
    if (previous.get('expiresAtMs') > now) throw new HttpsError('aborted', 'Es läuft bereits eine DyCoS-Suche. Bitte kurz warten.')
    const start = now - (previous.get('windowStart') || 0) < 60000 ? previous.get('windowStart') : now
    const count = start === previous.get('windowStart') ? previous.get('count') || 0 : 0
    if (count >= 20) throw new HttpsError('resource-exhausted', 'Zu viele Suchanfragen. Bitte kurz warten.', { retryAfterMs: Math.max(1000, start + 60000 - now) })
    tx.set(ref, { windowStart: start, count: count + 1, token, expiresAtMs: now + 150000 })
  })
  return ref
}

export async function searchDycosTransportOrdersHandler(request, { db = getFirestore(), fetchSearch = fetchDycosFlowSearch, report = recordDiagnostic } = {}) {
  const profile = await requireActiveProfile(request)
  if (!hasDycosImportAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Datenimporte.')
  const query = validateDycosSearchRequest(request.data), token = randomUUID()
  const quota = await claimSearch(db, request.auth.uid, token)
  let stage = 'search'
  try {
    const payload = await fetchSearch(query)
    stage = 'search-mapping'
    const result = query.modus === 'relationen' ? { relations: mapDycosRelationOptions(payload) } : mapDycosSearchPage(payload, query)
    const current = await requireActiveProfile(request)
    if (!hasDycosImportAccess(current)) throw new HttpsError('permission-denied', 'Die Importberechtigung wurde inzwischen geändert.')
    if (result.orders?.length) {
      const existing = await db.getAll(...result.orders.map(order => db.doc(`transportOrders/dycos-${order.externalNumber}`)))
      result.orders = result.orders.map((order, index) => ({ ...order, existing: existing[index].exists }))
    }
    return result
  } catch (error) {
    if (error instanceof HttpsError) throw error
    if (error?.code === 'search_page_too_large') throw new HttpsError('failed-precondition', 'Die Vorschau ist zu umfangreich. Bitte den Zeitraum verkleinern.')
    const message = 'Die DyCoS-Suche konnte nicht zuverlässig ausgeführt werden. Bitte erneut versuchen.'
    try { await report({ module: 'dycos-import', stage, code: ['source_auth', 'source_configuration', 'source_timeout', 'source_invalid_response', 'source_unavailable'].includes(error?.code) ? error.code : 'dycos_search_failed', message, actorId: request.auth.uid, actorName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Unbekannt', recordId: token }, db) } catch { /* Preserve the actual search failure. */ }
    throw new HttpsError('unavailable', message)
  } finally {
    try { await db.runTransaction(async tx => { const current = await tx.get(quota); if (current.get('token') === token) tx.update(quota, { expiresAtMs: 0 }) }) } catch { /* Lease bounds interrupted requests. */ }
  }
}
