import assert from 'node:assert/strict'
import test from 'node:test'
import { mapDycosRelationOptions, mapDycosSearchPage, validateDycosSearchRequest } from './dycosOrderSearch.js'
import { dycosImportEligibility } from './shared/dycosImportPolicy.js'

const query = { modus: 'suche', ladeDatumVon: '2026-11-01', ladeDatumBis: '2026-11-03', relationId: null, nachId: 0 }
const fixture = () => ({ schemaVersion: 1, pageSize: 15, hasMore: false, nextNachId: 2,
  auftraege: [{ ID: 1, Nummer: 261100001, Ladedatum: '2026-11-02T00:00:00Z', FrachtzahlerID: 10, TourenID: 20, RelationsID: 30 }, { ID: 2, Nummer: 261100002, Ladedatum: '2026-11-03T15:30:00Z', FrachtzahlerID: null, TourenID: null, RelationsID: null }],
  kunden: [{ ID: 10, Firma: 'Kunde', bankAccount: 'must-not-leave-server' }], touren: [{ ID: 20, UnternehmerID: 40 }], unternehmer: [{ ID: 40, Bezeichnung: 'Unternehmer', password: 'must-not-leave-server' }], relationen: [{ ID: 30, Bezeichnung: '06 Team' }],
  stationen: [
    { ID: 103, AuftragsID: 1, Zeile_In_Auftrag: 4, Lade_Entladestelle: 'E', Firma: 'Letztes Ziel' },
    { ID: 102, AuftragsID: 1, Zeile_In_Auftrag: 3, Lade_Entladestelle: 'E', Firma: 'Zwischenziel' },
    { ID: 101, AuftragsID: 1, Zeile_In_Auftrag: 2, Lade_Entladestelle: 'L', Firma: 'Zweite Ladestelle' },
    { ID: 100, AuftragsID: 1, Zeile_In_Auftrag: 1, Lade_Entladestelle: 'L', Firma: 'Erste Ladestelle' },
  ] })

test('search accepts only calendar dates from January 2026, canonical cursor and optional SQL relation IDs', () => {
  assert.deepEqual(validateDycosSearchRequest({ ladeDatumVon: '2026-01-01', ladeDatumBis: '2027-01-01' }), { ...query, ladeDatumVon: '2026-01-01', ladeDatumBis: '2027-01-01' })
  assert.deepEqual(validateDycosSearchRequest({ modus: 'relationen' }), { modus: 'relationen' })
  for (const patch of [{ ladeDatumVon: '2025-12-31' }, { ladeDatumVon: '2026-02-30' }, { ladeDatumBis: '2026-01-01' }, { nachId: -1 }, { relationId: '06' }, { relationId: 2147483648 }, { flowUrl: 'https://untrusted.invalid' }]) assert.throws(() => validateDycosSearchRequest({ ...query, ...patch }), { code: 'invalid-argument' })
  assert.throws(() => validateDycosSearchRequest({ modus: 'relationen', nachId: 0 }), { code: 'invalid-argument' })
})

test('preview joins only matching identities, chooses first loading and last unloading and leaves missing data blank', () => {
  const result = mapDycosSearchPage(fixture(), query)
  assert.equal(result.orders[0].customer, 'Kunde'); assert.equal(result.orders[0].carrier, 'Unternehmer')
  assert.equal(result.orders[0].loading.company, 'Erste Ladestelle'); assert.equal(result.orders[0].unloading.company, 'Letztes Ziel')
  assert.equal(result.orders[1].loading, null); assert.equal(result.orders[1].customer, '')
  assert.equal(JSON.stringify(result).includes('must-not-leave-server'), false)
  assert.equal(result.nextCursor, null)
})

test('unrelated rows, duplicate identities, date/relation violations and invalid continuations fail closed', () => {
  for (const mutate of [
    p => { p.kunden[0].ID = 99 }, p => { p.touren[0].ID = 99 }, p => { p.unternehmer[0].ID = 99 }, p => { p.relationen[0].ID = 99 },
    p => { p.stationen[0].AuftragsID = 99 }, p => p.kunden.push({ ...p.kunden[0] }), p => { p.auftraege[0].Ladedatum = '2025-12-31' },
    p => { p.auftraege.reverse() }, p => { p.hasMore = true; p.nextNachId = 1 }, p => { p.hasMore = 'yes' },
  ]) { const data = fixture(); mutate(data); assert.throws(() => mapDycosSearchPage(data, query)) }
  assert.throws(() => mapDycosSearchPage(fixture(), { ...query, relationId: 99 }))
  const data = fixture(); data.hasMore = true
  assert.equal(mapDycosSearchPage(data, query).nextCursor, 2)
  assert.deepEqual(mapDycosSearchPage({ ...fixture(), auftraege: [], kunden: [], touren: [], unternehmer: [], stationen: [], relationen: [] }, query).orders, [])
})

test('relation catalog uses actual SQL IDs and labels, never their leading display number as the ID', () => {
  assert.deepEqual(mapDycosRelationOptions({ schemaVersion: 1, relationen: [{ ID: 8, Nummer: 8, Bezeichnung: '06 Team', hidden: 'secret' }] }), [{ id: 8, label: '06 Team' }])
})

test('import cutoff uses the authoritative date and falls back only to valid YYMM numbers for absent dates', () => {
  for (const date of ['2026-01-01', '2027-01-01T08:00:00Z']) assert.equal(dycosImportEligibility(date, '251200123').allowed, true)
  for (const date of ['2025-12-31', '2026-02-30', false]) assert.equal(dycosImportEligibility(date, '270100123').allowed, false)
  for (const date of [null, '', '1899-12-30T00:00:00Z']) {
    for (const number of ['260100123', '261200123', '270100123']) assert.equal(dycosImportEligibility(date, number).allowed, true)
    for (const number of ['251200123', '260000123', '261300123', '2601', 'unknown']) assert.equal(dycosImportEligibility(date, number).allowed, false)
  }
})
