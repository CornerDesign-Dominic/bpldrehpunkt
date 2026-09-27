import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildCoarsePlace, buildTomTomGeocodingUrl, emptyTomTomUsageSummary, geocodeCacheDocumentId, hasRouteEditAccess, normaliseLocationQuery, normaliseTomTomApiKey, roundRouteDistanceKm } from './transportOrderRoutes.js'
import { routingCountryCodes } from './shared/routingCountries.js'

test('TomTom key normalisation accepts the secret value only, an assignment, and surrounding quotes', () => {
  assert.equal(normaliseTomTomApiKey(' key-value '), 'key-value')
  assert.equal(normaliseTomTomApiKey('TOMTOM_ROUTING_API_KEY = key-value'), 'key-value')
  assert.equal(normaliseTomTomApiKey('"key-value"'), 'key-value')
})

test('location lookup normalises diacritics without using an address', () => {
  assert.equal(normaliseLocationQuery(' 25101 Říčany '), '25101 Ricany')
})

test('coarse places use only country, postal code and city', () => {
  const place = buildCoarsePlace({ country: 'Deutschland', postalCode: '47809', city: 'Krefeld', originalText: 'Firma Beispiel, Straße 1' }, 'ersten Ladestelle')
  assert.equal(place.label, 'DE, 47809 Krefeld')
  assert.equal(place.cacheKey, 'de|47809|krefeld')
  assert.equal(place.countryCode, 'DE')
  assert.equal(place.label.includes('Firma'), false)
  assert.match(geocodeCacheDocumentId(place.cacheKey), /^[A-Za-z0-9_-]+$/)
  assert.equal(geocodeCacheDocumentId(place.cacheKey), geocodeCacheDocumentId('de|47809|krefeld'))
})

test('embedded country and postal-code prefixes create an ISO coarse place without reading the address', () => {
  const place = buildCoarsePlace({ city: 'D 47809 Krefeld', originalText: 'Firma Beispiel, Straße 1, Krefeld' }, 'ersten Ladestelle')
  const portugal = buildCoarsePlace({ city: 'PT 4505 Santa Maria da Feira', originalText: 'Firma Beispiel, Straße 1, Santa Maria da Feira' }, 'erste Entladestelle')
  const portugalWithDistrict = buildCoarsePlace({ city: 'PT 4505 SANTA MARIA DA FEIRA ARGONCILHE' }, 'erste Entladestelle')
  const france = buildCoarsePlace({ country: 'France', postalCode: '75001', city: 'Paris' }, 'letzten Entladestelle')
  const austria = buildCoarsePlace({ city: 'A 4211 Alberndorf in der Riedmark' }, 'letzten Entladestelle')
  assert.deepEqual({ label: place.label, query: place.query, countryCode: place.countryCode, cacheKey: place.cacheKey }, { label: 'DE, 47809 Krefeld', query: '47809 Krefeld', countryCode: 'DE', cacheKey: 'de|47809|krefeld' })
  assert.deepEqual({ postalCode: portugal.postalCode, city: portugal.city, query: portugal.query, countryCode: portugal.countryCode }, { postalCode: '', city: 'Santa Maria da Feira', query: 'Santa Maria da Feira', countryCode: 'PT' })
  assert.deepEqual({ postalCode: portugalWithDistrict.postalCode, city: portugalWithDistrict.city, query: portugalWithDistrict.query, countryCode: portugalWithDistrict.countryCode }, { postalCode: '', city: 'SANTA MARIA DA FEIRA ARGONCILHE', query: 'SANTA MARIA DA FEIRA ARGONCILHE', countryCode: 'PT' })
  assert.equal(france.countryCode, 'FR')
  assert.deepEqual({ countryCode: austria.countryCode, query: austria.query }, { countryCode: 'AT', query: '4211 Alberndorf in der Riedmark' })
  assert.equal(place.label.includes('Firma'), false)
})

test('ambiguous country prefixes require a selection and accept only one of their offered countries', () => {
  const ambiguousPoland = buildCoarsePlace({ city: 'P 00-001 Warszawa' }, 'letzten Entladestelle')
  const ambiguousSpain = buildCoarsePlace({ city: 'S 28001 Madrid' }, 'ersten Ladestelle')
  const poland = buildCoarsePlace({ city: 'P 00-001 Warszawa' }, 'letzten Entladestelle', 'PL')
  const portugal = buildCoarsePlace({ city: 'P 4000-001 Porto' }, 'letzten Entladestelle', 'PT')
  assert.deepEqual({ code: ambiguousPoland.errorCode, candidates: ambiguousPoland.countryCandidates.map(({ code }) => code) }, { code: 'country_ambiguous', candidates: ['PL', 'PT'] })
  assert.deepEqual({ code: ambiguousSpain.errorCode, candidates: ambiguousSpain.countryCandidates.map(({ code }) => code) }, { code: 'country_ambiguous', candidates: ['ES', 'SE'] })
  assert.deepEqual({ countryCode: poland.countryCode, query: poland.query }, { countryCode: 'PL', query: '00-001 Warszawa' })
  assert.deepEqual({ countryCode: portugal.countryCode, query: portugal.query }, { countryCode: 'PT', query: '4000-001 Porto' })
  assert.equal(buildCoarsePlace({ city: 'P 00-001 Warszawa' }, 'letzten Entladestelle', 'DE').errorCode, 'country_ambiguous')
})

test('TomTom geocoding uses only postal code and city with an ISO Alpha-2 countrySet', () => {
  const place = buildCoarsePlace({ country: 'Deutschland', postalCode: '47809', city: 'Krefeld', originalText: 'Firma Beispiel, Straße 1' }, 'ersten Ladestelle')
  const kosovo = buildCoarsePlace({ country: 'Kosovo', city: 'Pristina' }, 'letzten Entladestelle')
  const url = buildTomTomGeocodingUrl(place, 'test-key')
  assert.match(url, /search\/47809%20Krefeld\.json/)
  assert.match(url, /countrySet=DE/)
  assert.equal(url.includes('Firma'), false)
  assert.equal(url.includes('Deutschland'), false)
  assert.match(buildTomTomGeocodingUrl(kosovo, 'test-key'), /countrySet=XK/)
})

test('every whitelisted country is passed to TomTom only as its ISO Alpha-2 countrySet', () => {
  for (const countryCode of routingCountryCodes) {
    const place = buildCoarsePlace({ country: countryCode, city: 'Testort' }, 'Teststation')
    const url = buildTomTomGeocodingUrl(place, 'test-key')
    assert.equal(place.countryCode, countryCode)
    assert.match(url, new RegExp(`countrySet=${countryCode}(?:&|$)`))
    assert.equal(url.includes(`countrySet=${encodeURIComponent(place.country)}`), true)
  }
})

test('unknown or conflicting countries are rejected without guessing', () => {
  assert.equal(buildCoarsePlace({ country: 'Atlantis', city: 'Krefeld' }, 'ersten Ladestelle').errorCode, 'country_unknown')
  assert.equal(buildCoarsePlace({ city: 'XX 47809 Krefeld' }, 'ersten Ladestelle').errorCode, 'country_unknown')
  assert.equal(buildCoarsePlace({ country: 'DE', city: 'FR 75001 Paris' }, 'ersten Ladestelle').errorCode, 'country_conflict')
})

test('legacy DyCoS prefixes remain supported through the central country normalisation', () => {
  const place = buildCoarsePlace({ city: 'CZ 25101 Říčany', originalText: 'DHL Supply Chain, Straße 100, Říčany' }, 'ersten Ladestelle')
  const destination = buildCoarsePlace({ city: 'D 94522 Wallersdorf', originalText: 'SMYTHS TOYS, Robert-Bosch-Straße 1, Wallersdorf' }, 'letzten Entladestelle')
  assert.deepEqual({ label: place.label, query: place.query, countryCode: place.countryCode, cacheKey: place.cacheKey }, { label: 'CZ, 25101 Říčany', query: '25101 Ricany', countryCode: 'CZ', cacheKey: 'cz|25101|ricany' })
  assert.equal(destination.label, 'DE, 94522 Wallersdorf')
  assert.equal(destination.countryCode, 'DE')
  assert.equal(destination.label.includes('SMYTHS'), false)
})

test('usage events and monthly summaries remain server-side, and imports do not calculate routes', async () => {
  const [routeSource, clientSource, importSource] = await Promise.all([
    readFile(new URL('./transportOrderRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/transportOrders.js', import.meta.url), 'utf8'),
    readFile(new URL('./transportOrderImports.js', import.meta.url), 'utf8'),
  ])
  assert.match(routeSource, /tomTomUsageEvents/)
  assert.match(routeSource, /status, month/)
  assert.match(routeSource, /getTomTomUsageSummaryHandler/)
  assert.match(routeSource, /travelMode=truck/)
  assert.equal(routeSource.includes('vehicle=truck'), false)
  assert.equal(clientSource.includes('TOMTOM_ROUTING_API_KEY'), false)
  assert.equal(importSource.includes('calculateTransportOrderRoute'), false)
  assert.deepEqual(emptyTomTomUsageSummary('2026-09'), { month: '2026-09', manualCalculations: 0, routingRequests: 0, geocodingRequests: 0, succeededRequests: 0, failedRequests: 0, monthlyFreeQuota: 20000 })
})

test('incomplete places do not produce a queryable location and route distances round up to ten kilometres', () => {
  assert.equal(buildCoarsePlace({ country: 'Deutschland' }, 'ersten Ladestelle').errorCode, 'place_incomplete')
  assert.equal(roundRouteDistanceKm(401000), 410)
  assert.equal(roundRouteDistanceKm(410000), 410)
  assert.equal(roundRouteDistanceKm(411000), 420)
})

test('route calculation requires transportOrders.edit except for superadmins', () => {
  assert.equal(hasRouteEditAccess({ role: 'user', permissions: { transportOrders: 'view' } }), false)
  assert.equal(hasRouteEditAccess({ role: 'user', permissions: { transportOrders: 'edit' } }), true)
  assert.equal(hasRouteEditAccess({ role: 'superadmin', permissions: { transportOrders: 'none' } }), true)
})
