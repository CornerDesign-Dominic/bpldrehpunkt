import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { Buffer } from 'node:buffer'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'
import { appendDiagnosticToBatch } from './diagnostics.js'
import { routingCountryCandidates } from './shared/routingCountries.js'

export const tomTomRoutingApiKey = defineSecret('TOMTOM_ROUTING_API_KEY')
export const routeProfile = 'standard_truck_coarse'
const levels = { none: 0, view: 1, edit: 2 }
const text = (value) => typeof value === 'string' ? value.trim() : ''
export const normaliseTomTomApiKey = (value) => text(value)
  .replace(/^TOMTOM_ROUTING_API_KEY\s*=\s*/i, '')
  .replace(/^(['"])(.*)\1$/, '$2')
  .trim()
export const normaliseLocationQuery = (value) => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
const currentMonth = (date = new Date()) => date.toISOString().slice(0, 7)
const actorName = (profile) => [text(profile?.firstName), text(profile?.lastName)].filter(Boolean).join(' ') || text(profile?.email) || 'Unbekannt'

class RouteProblem extends Error {
  constructor(code, message) { super(message); this.code = code }
}

export function hasRouteEditAccess(profile) { return profile?.role === 'superadmin' || levels[profile?.permissions?.transportOrders] >= levels.edit }
function countryResolution(value, selectedCountryCode) {
  const candidates = routingCountryCandidates(value)
  if (candidates.length <= 1) return { country: candidates[0] || null }
  const selected = candidates.find((candidate) => candidate.code === text(selectedCountryCode).toUpperCase())
  return selected ? { country: selected } : { candidates }
}
function ambiguousCountryProblem(value, candidates, stationLabel) {
  return {
    errorCode: 'country_ambiguous',
    userSafeError: `Das Länderkürzel „${value}“ der ${stationLabel} ist nicht eindeutig. Bitte das zutreffende Land auswählen.`,
    countryValue: value,
    countryCandidates: candidates.map(({ code, name }) => ({ code, name })),
  }
}
function isUsableRoutingPostalCode(countryCode, postalCode) {
  if (!postalCode) return false
  // Portuguese imports occasionally contain only the first four digits. It is
  // not a complete postcode and would make a city search needlessly brittle.
  return countryCode !== 'PT' || /^\d{4}-\d{3}$/.test(postalCode)
}
export function buildCoarsePlace(station, stationLabel, selectedCountryCode = '') {
  const rawCountry = text(station?.country)
  const rawCountryResolution = rawCountry ? countryResolution(rawCountry, selectedCountryCode) : { country: null }
  if (rawCountryResolution.candidates) return ambiguousCountryProblem(rawCountry, rawCountryResolution.candidates, stationLabel)
  let country = rawCountryResolution.country
  let postalCode = text(station?.postalCode)
  let city = text(station?.city)
  // Imports may put an ISO/legacy country prefix and postal code in city
  // (for example "D 47809 Krefeld" or "PT 4505 Santa Maria da Feira").
  // Only city and postal code are retained for the TomTom search.
  const countryPrefix = city.match(/^([A-Za-z]{1,3})\s+(.+)$/)
  const prefixCountryResolution = countryPrefix ? countryResolution(countryPrefix[1], selectedCountryCode) : { country: null }
  if (prefixCountryResolution.candidates) return ambiguousCountryProblem(countryPrefix[1], prefixCountryResolution.candidates, stationLabel)
  const prefixedCountry = prefixCountryResolution.country
  if (rawCountry && !country) return { errorCode: 'country_unknown', userSafeError: `Das Land der ${stationLabel} ist unbekannt. Bitte ein ISO-3166-Alpha-2-Kürzel oder einen bekannten Ländernamen verwenden.` }
  if (prefixedCountry) {
    if (country && country.code !== prefixedCountry.code) return { errorCode: 'country_conflict', userSafeError: `Die Länderangaben der ${stationLabel} widersprechen sich.` }
    country = prefixedCountry
    city = countryPrefix[2].trim()
  } else if (!country && countryPrefix && /^\d/.test(countryPrefix[2])) {
    return { errorCode: 'country_unknown', userSafeError: `Das Länderkürzel „${countryPrefix[1]}“ der ${stationLabel} ist unbekannt.` }
  }
  const embeddedPostalCode = city.match(/^(\d{4,6}(?:-\d{1,4})?|\d{3}\s\d{2}|\d{4}\s?[A-Za-z]{2})\s+(.+)$/)
  if (!postalCode && embeddedPostalCode) {
    postalCode = embeddedPostalCode[1].trim()
    city = embeddedPostalCode[2].trim()
  }
  if (!country || !city) return { errorCode: 'place_incomplete', userSafeError: `Für die Streckenberechnung fehlen Land oder Ort der ${stationLabel}.` }
  const countryCode = country.code
  if (!isUsableRoutingPostalCode(countryCode, postalCode)) postalCode = ''
  const label = [countryCode, postalCode && city ? `${postalCode} ${city}` : city].filter(Boolean).join(', ')
  const cacheKey = [countryCode, postalCode, city].map((value) => value.toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()).join('|')
  const query = normaliseLocationQuery([postalCode, city].filter(Boolean).join(' '))
  return { country: countryCode, countryCode, postalCode, city, query, label, cacheKey }
}
export function roundRouteDistanceKm(distanceMeters) { return Math.ceil((distanceMeters / 1000) / 10) * 10 }
export function geocodeCacheDocumentId(cacheKey) { return Buffer.from(cacheKey).toString('base64url') }
export function emptyTomTomUsageSummary(month) { return { month, manualCalculations: 0, routingRequests: 0, geocodingRequests: 0, succeededRequests: 0, failedRequests: 0, monthlyFreeQuota: 20000 } }
export function buildTomTomGeocodingUrl(place, apiKey) {
  return `https://api.tomtom.com/search/2/search/${encodeURIComponent(place.query)}.json?key=${encodeURIComponent(apiKey)}&limit=1&countrySet=${encodeURIComponent(place.countryCode)}`
}

async function logTomTomUsage({ db, api, orderId, routeCalculationId, userId, status }) {
  const month = currentMonth()
  const eventRef = db.collection('tomTomUsageEvents').doc()
  const summaryRef = db.doc(`tomTomUsageMonths/${month}`)
  const apiField = api === 'routing' ? 'routingRequests' : 'geocodingRequests'
  const statusField = status === 'succeeded' ? 'succeededRequests' : 'failedRequests'
  const batch = db.batch()
  batch.set(eventRef, { provider: 'tomtom', api, operation: 'calculate_transport_route', orderId, routeCalculationId, requestedAt: FieldValue.serverTimestamp(), requestedBy: userId, status, month })
  batch.set(summaryRef, { month, [apiField]: FieldValue.increment(1), [statusField]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  await batch.commit()
}

async function tomTomRequest({ db, api, orderId, routeCalculationId, userId, url }) {
  let status = 'failed'
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
      logger.warn(`TomTom-${api}-Anfrage mit HTTP-Status ${response.status} fehlgeschlagen.`)
      if (response.status === 401 || response.status === 403) throw new RouteProblem('provider_unauthorized', 'Die Routendienst-Konfiguration in der Dev-Umgebung wurde vom Dienst abgelehnt.')
      throw new RouteProblem('provider_unavailable', 'Der Routendienst ist momentan nicht erreichbar.')
    }
    const data = await response.json()
    status = 'succeeded'
    return data
  } catch (error) {
    if (!(error instanceof RouteProblem)) logger.warn(`TomTom-${api}-Anfrage fehlgeschlagen (${error?.name || 'network_error'}).`)
    throw error
  } finally {
    await logTomTomUsage({ db, api, orderId, routeCalculationId, userId, status })
  }
}

async function geocodePlace({ db, place, apiKey, orderId, routeCalculationId, userId }) {
  const cacheRef = db.doc(`tomTomGeocodeCache/${geocodeCacheDocumentId(place.cacheKey)}`)
  const cached = await cacheRef.get()
  if (cached.exists && Number.isFinite(cached.data()?.latitude) && Number.isFinite(cached.data()?.longitude)) return { latitude: cached.data().latitude, longitude: cached.data().longitude }
  const data = await tomTomRequest({ db, api: 'geocoding', orderId, routeCalculationId, userId, url: buildTomTomGeocodingUrl(place, apiKey) })
  const position = data?.results?.[0]?.position
  if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lon)) throw new RouteProblem('place_not_found', `Der Ortsbezug „${place.label}“ konnte nicht bestimmt werden.`)
  const coordinates = { latitude: position.lat, longitude: position.lon }
  await cacheRef.set({ cacheKey: place.cacheKey, placeLabel: place.label, ...coordinates, provider: 'tomtom', updatedAt: FieldValue.serverTimestamp() })
  return coordinates
}

const diagnosticMessages = {
  place_incomplete: 'Land oder Ort fehlt.',
  country_unknown: 'Land oder Länderkürzel unbekannt.',
  country_ambiguous: 'Länderkürzel ist nicht eindeutig.',
  country_conflict: 'Länderangaben widersprechen sich.',
  place_not_found: 'Ort konnte nicht bestimmt werden.',
  route_not_found: 'Keine LKW-Planungsstrecke gefunden.',
  provider_unauthorized: 'Routendienst hat die Konfiguration abgelehnt.',
  provider_unavailable: 'Routendienst nicht verfügbar.',
  provider_not_configured: 'Routendienst nicht konfiguriert.',
}

async function saveCalculation({ db, orderId, calculationId, profile, actorId, status, originPlace, destinationPlace, originCoordinates = null, destinationCoordinates = null, rawDistanceMeters = null, errorCode = null, userSafeError = null, failureStage = null }) {
  const routeRef = db.doc(`transportOrderRoutes/${orderId}`)
  const calculationRef = routeRef.collection('calculations').doc(calculationId)
  const rawDistanceKm = Number.isFinite(rawDistanceMeters) ? rawDistanceMeters / 1000 : null
  const roundedDistanceKm = Number.isFinite(rawDistanceMeters) ? roundRouteDistanceKm(rawDistanceMeters) : null
  const data = {
    orderId, originPlaceLabel: originPlace?.label || null, destinationPlaceLabel: destinationPlace?.label || null,
    originCoordinates, destinationCoordinates, rawDistanceMeters, rawDistanceKm, roundedDistanceKm,
    calculatedAt: FieldValue.serverTimestamp(), calculatedBy: actorId, calculatedByName: actorName(profile),
    routeProfile, status, errorCode, userSafeError,
  }
  const month = currentMonth()
  const batch = db.batch()
  batch.set(calculationRef, { ...data, calculationId })
  const latestRoute = status === 'succeeded'
    ? { ...data, latestCalculationId: calculationId }
    : { orderId, latestCalculationId: calculationId, latestCalculationStatus: status, calculatedAt: data.calculatedAt, calculatedBy: data.calculatedBy, calculatedByName: data.calculatedByName, status, errorCode, userSafeError, routeProfile }
  batch.set(routeRef, latestRoute, { merge: true })
  if (status === 'succeeded') batch.set(db.doc(`transportOrders/${orderId}`), { routeNeedsRecalculation: false, routeRecalculatedAt: FieldValue.serverTimestamp() }, { merge: true })
  batch.set(db.doc(`tomTomUsageMonths/${month}`), { month, manualCalculations: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  if (status === 'failed') appendDiagnosticToBatch(batch, db, {
    module: 'transport-route', stage: failureStage || 'preparation', code: errorCode,
    message: diagnosticMessages[errorCode] || 'Streckenberechnung fehlgeschlagen.',
    actorId, actorName: actorName(profile), orderId,
    originCountry: originPlace?.countryCode, destinationCountry: destinationPlace?.countryCode,
  })
  await batch.commit()
  return { calculationId, roundedDistanceKm }
}

export async function calculateTransportOrderRouteHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasRouteEditAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Streckenberechnung.')
  const orderId = text(request.data?.orderId)
  if (!orderId || orderId.length > 240) throw new HttpsError('invalid-argument', 'Ungültiger Transportauftrag.')
  const db = getFirestore(); const orderSnapshot = await db.doc(`transportOrders/${orderId}`).get()
  if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
  const countryOverrides = request.data?.countryOverrides && typeof request.data.countryOverrides === 'object' ? request.data.countryOverrides : {}
  const originPlace = buildCoarsePlace(orderSnapshot.data()?.imported?.loading, 'ersten Ladestelle', countryOverrides.loading)
  const destinationPlace = buildCoarsePlace(orderSnapshot.data()?.imported?.unloading, 'letzten Entladestelle', countryOverrides.unloading)
  const calculationId = db.collection('transportOrderRoutes').doc(orderId).collection('calculations').doc().id
  if (originPlace.errorCode || destinationPlace.errorCode) {
    const routeProblems = [
      { place: originPlace, station: 'loading', stationLabel: 'Erste Ladestelle' },
      { place: destinationPlace, station: 'unloading', stationLabel: 'Letzte Entladestelle' },
    ].filter(({ place }) => place.errorCode).map(({ place, station, stationLabel }) => ({
      code: place.errorCode, station, stationLabel, countryValue: place.countryValue || null, countryCandidates: place.countryCandidates || [],
    }))
    const problem = originPlace.errorCode ? originPlace : destinationPlace
    await saveCalculation({ db, orderId, calculationId, profile, actorId: request.auth.uid, status: 'failed', originPlace, destinationPlace, errorCode: problem.errorCode, userSafeError: problem.userSafeError, failureStage: 'preparation' })
    throw new HttpsError('failed-precondition', problem.userSafeError, { routeProblems })
  }
  const apiKey = normaliseTomTomApiKey(tomTomRoutingApiKey.value())
  if (!apiKey) {
    const userSafeError = 'Die Streckenberechnung ist noch nicht konfiguriert.'
    await saveCalculation({ db, orderId, calculationId, profile, actorId: request.auth.uid, status: 'failed', originPlace, destinationPlace, errorCode: 'provider_not_configured', userSafeError, failureStage: 'configuration' })
    throw new HttpsError('failed-precondition', userSafeError)
  }
  let stage = 'geocoding_origin'
  try {
    const originCoordinates = await geocodePlace({ db, place: originPlace, apiKey, orderId, routeCalculationId: calculationId, userId: request.auth.uid })
    stage = 'geocoding_destination'
    const destinationCoordinates = await geocodePlace({ db, place: destinationPlace, apiKey, orderId, routeCalculationId: calculationId, userId: request.auth.uid })
    stage = 'routing'
    const points = `${originCoordinates.latitude},${originCoordinates.longitude}:${destinationCoordinates.latitude},${destinationCoordinates.longitude}`
    const data = await tomTomRequest({ db, api: 'routing', orderId, routeCalculationId: calculationId, userId: request.auth.uid, url: `https://api.tomtom.com/routing/1/calculateRoute/${points}/json?key=${encodeURIComponent(apiKey)}&travelMode=truck` })
    const rawDistanceMeters = data?.routes?.[0]?.summary?.lengthInMeters
    if (!Number.isFinite(rawDistanceMeters) || rawDistanceMeters <= 0) throw new RouteProblem('route_not_found', 'Für diese Orte konnte keine LKW-Planungsstrecke bestimmt werden.')
    const route = await saveCalculation({ db, orderId, calculationId, profile, actorId: request.auth.uid, status: 'succeeded', originPlace, destinationPlace, originCoordinates, destinationCoordinates, rawDistanceMeters })
    return { route }
  } catch (error) {
    const errorCode = ['place_not_found', 'route_not_found', 'provider_unauthorized'].includes(error?.code) ? error.code : 'provider_unavailable'
    const userSafeError = ['place_not_found', 'route_not_found', 'provider_unauthorized'].includes(error?.code) ? error.message : 'Die Streckenberechnung ist momentan nicht verfügbar. Bitte versuche es später erneut.'
    logger.warn(`Streckenberechnung fehlgeschlagen (${errorCode}).`)
    await saveCalculation({ db, orderId, calculationId, profile, actorId: request.auth.uid, status: 'failed', originPlace, destinationPlace, errorCode, userSafeError, failureStage: stage })
    if (error instanceof HttpsError) throw error
    throw new HttpsError('unavailable', userSafeError)
  }
}

export async function getTomTomUsageSummaryHandler(request) {
  const profile = await requireActiveProfile(request)
  requireRole(profile, ['admin', 'superadmin'], 'Keine Berechtigung für die TomTom-Nutzung.')
  const month = text(request.data?.month) || currentMonth()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpsError('invalid-argument', 'Ungültiger Monat.')
  const snapshot = await getFirestore().doc(`tomTomUsageMonths/${month}`).get()
  const usage = snapshot.exists ? snapshot.data() : {}
  return { ...emptyTomTomUsageSummary(month), manualCalculations: usage.manualCalculations || 0, routingRequests: usage.routingRequests || 0, geocodingRequests: usage.geocodingRequests || 0, succeededRequests: usage.succeededRequests || 0, failedRequests: usage.failedRequests || 0 }
}
