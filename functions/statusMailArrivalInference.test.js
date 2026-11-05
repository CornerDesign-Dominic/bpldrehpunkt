import test from 'node:test'
import assert from 'node:assert/strict'
import { relativeArrivalTime, arrivalDerivation, arrivalChronologyFits, storedArrivalDerivation } from './statusMailArrivalInference.js'

const mail = { bodyText: 'Gerade an der Entladestelle angekommen.', receivedAt: new Date('2026-11-05T13:12:49Z') }
const update = { field: 'actualArrivalUnloadingAt', evidence: mail.bodyText, timeBasis: 'mail_just_arrived', stationBasis: 'explicit', contextFields: [] }

test('relative rounding includes seconds, exact boundaries, midnight and daylight-saving transitions', () => {
  for (const [received, basis, expected] of [
    ['2026-11-05T13:12:49Z', 'mail_just_arrived', '2026-11-05T13:10:00.000Z'],
    ['2026-11-05T13:12:49Z', 'mail_already_arrived', '2026-11-05T13:10:00.000Z'],
    ['2026-11-05T13:12:49Z', 'mail_arriving_soon', '2026-11-05T13:30:00.000Z'],
    ['2026-11-05T13:10:00Z', 'mail_arriving_soon', '2026-11-05T13:25:00.000Z'],
    ['2026-11-05T13:10:01Z', 'mail_arriving_soon', '2026-11-05T13:30:00.000Z'],
    ['2026-11-05T23:59:59Z', 'mail_arriving_soon', '2026-11-06T00:15:00.000Z'],
    ['2026-03-29T00:59:59Z', 'mail_arriving_soon', '2026-03-29T01:15:00.000Z'],
    ['2026-10-25T00:59:59Z', 'mail_arriving_soon', '2026-10-25T01:15:00.000Z'],
  ]) assert.equal(relativeArrivalTime(new Date(received), basis).toISOString(), expected)
  assert.equal(relativeArrivalTime('not a date', 'mail_just_arrived'), null)
})

test('an arrived state without exact time remains a marked approximate proposal', () => {
  assert.deepEqual(arrivalDerivation(update, mail), { timeBasis: 'mail_just_arrived', stationBasis: 'explicit', basedOnFields: [], mailReceivedAt: mail.receivedAt.toISOString(), timingApproximate: true, ruleVersion: 1 })
  const already = { ...mail, bodyText: 'Ist bereits an der Entladestelle angekommen.' }
  assert.equal(arrivalDerivation({ ...update, evidence: already.bodyText, timeBasis: 'mail_already_arrived' }, already).timingApproximate, true)
})

test('multilingual arrival and coming-soon statements keep actual and expected fields separate', () => {
  for (const [bodyText, basis, field] of [
    ['Just arrived at unloading.', 'mail_just_arrived', 'actualArrivalUnloadingAt'],
    ['Jest już na miejscu rozładunku.', 'mail_already_arrived', 'actualArrivalUnloadingAt'],
    ['Il est déjà arrivé au déchargement.', 'mail_already_arrived', 'actualArrivalUnloadingAt'],
    ['Coming soon to unloading.', 'mail_arriving_soon', 'estimatedArrivalUnloadingAt'],
    ['Kommt gleich an der Ladestelle an.', 'mail_arriving_soon', 'estimatedArrivalLoadingAt'],
  ]) {
    const current = { ...mail, bodyText }
    assert.ok(arrivalDerivation({ ...update, field, timeBasis: basis, evidence: bodyText }, current), bodyText)
  }
  const soon = { ...mail, bodyText: 'Kommt gleich an der Entladestelle an.' }
  assert.equal(arrivalDerivation({ ...update, timeBasis: 'mail_arriving_soon', evidence: soon.bodyText }, soon), null)
})

test('quoted, requested, negative or explicitly timed statements cannot invent relative arrival', () => {
  for (const bodyText of ['Ist er gerade an der Entladestelle angekommen?', 'Noch nicht an der Entladestelle angekommen.', 'Bitte melden wenn an der Entladestelle angekommen.', 'Bereits an der Entladestelle angekommen um 14:00 Uhr.']) {
    const current = { ...mail, bodyText }
    assert.equal(arrivalDerivation({ ...update, timeBasis: 'mail_already_arrived', evidence: bodyText }, current), null)
  }
  const quoted = { ...mail, bodyText: 'Danke.\nFrom: Dispatch\nGerade an der Entladestelle angekommen.' }
  assert.equal(arrivalDerivation(update, quoted), null)
  const blockQuoted = { ...mail, bodyText: 'Danke.\n> Gerade an der Entladestelle angekommen.' }
  assert.equal(arrivalDerivation(update, blockQuoted), null)
})

test('inferred station needs earlier stored evidence and never chains a derived value', () => {
  const current = { ...mail, bodyText: 'Ist gerade angekommen.' }
  const proposed = { ...update, evidence: current.bodyText, stationBasis: 'tracking_context', contextFields: ['actualDepartureLoadingAt'] }
  const tracking = { actualDepartureLoadingAt: new Date('2026-11-05T10:00:00Z') }
  assert.deepEqual(arrivalDerivation(proposed, current, { tracking }).basedOnFields, ['actualDepartureLoadingAt'])
  assert.equal(arrivalDerivation(proposed, current), null)
  assert.equal(arrivalDerivation(proposed, current, { tracking: { actualDepartureLoadingAt: new Date('2026-11-05T14:00:00Z') } }), null)
  assert.equal(arrivalDerivation(proposed, current, { tracking: { ...tracking, fieldSources: { actualDepartureLoadingAt: { derivation: { timingApproximate: true } } } } }), null)
  assert.equal(arrivalDerivation({ ...proposed, field: 'actualArrivalLoadingAt' }, current, { tracking }), null)
  assert.equal(arrivalDerivation(proposed, current, { tracking: { ...tracking, unloadingCompletedAt: new Date('2026-11-05T12:00:00Z') } }), null)
  assert.equal(arrivalChronologyFits(proposed.field, new Date('2026-11-05T09:00:00Z'), tracking), false)
})


test('station within the actual assertion wins over loading context in an earlier clause', () => {
  const current = { ...mail, bodyText: 'Abfahrt Ladestelle 10:00. Bereits an der Entladestelle angekommen.' }
  assert.ok(arrivalDerivation({ ...update, timeBasis: 'mail_already_arrived', evidence: 'Bereits an der Entladestelle angekommen.' }, current))
})

test('polite arrival announcements are facts while actual requests remain rejected', () => {
  for (const bodyText of ['Please note: already arrived at unloading.', 'Bitte beachten: bereits an der Entladestelle angekommen.']) {
    const current = { ...mail, bodyText }
    assert.ok(arrivalDerivation({ ...update, timeBasis: 'mail_already_arrived', evidence: bodyText }, current), bodyText)
  }
  for (const bodyText of ['Please confirm already arrived at unloading.', 'Bitte melden wenn an der Entladestelle angekommen.', 'Has he already arrived at unloading?']) {
    const current = { ...mail, bodyText }
    assert.equal(arrivalDerivation({ ...update, timeBasis: 'mail_already_arrived', evidence: bodyText }, current), null, bodyText)
  }
})


test('reply-context provenance survives sanitization without storing the question text', () => {
  const original = { timeBasis: 'mail_already_arrived', stationBasis: 'reply_context', basedOnFields: [], mailReceivedAt: '2026-11-05T13:12:37Z', timingApproximate: true, questionKind: 'loading_arrival', ruleVersion: 2, questionText: 'Private original request' }
  const stored = storedArrivalDerivation(original)
  assert.equal(stored.ruleVersion, 2)
  assert.equal(stored.questionKind, 'loading_arrival')
  assert.equal(stored.questionText, undefined)
})
