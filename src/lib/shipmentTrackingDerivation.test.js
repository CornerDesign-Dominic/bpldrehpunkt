import test from 'node:test'
import assert from 'node:assert/strict'
import { trackingDerivationLabels, trackingHistoryTimes, trackingEventDerivations, trackingReviewProposals, trackingArrivalOutcomeLabel, trackingReviewTransitProposals, trackingUnchangedTransitDerivation } from './shipmentTrackingDerivation.js'

test('relative arrival hints distinguish placeholder actual time and an estimated arrival in both languages', () => {
  assert.deepEqual(trackingDerivationLabels(null), [])
  assert.deepEqual(trackingDerivationLabels({ timeBasis: 'explicit', stationBasis: 'explicit' }), [])
  for (const language of ['de', 'en']) {
    const just = trackingDerivationLabels({ timeBasis: 'mail_just_arrived' }, language).join(' ')
    const already = trackingDerivationLabels({ timeBasis: 'mail_already_arrived' }, language).join(' ')
    const soon = trackingDerivationLabels({ timeBasis: 'mail_arriving_soon', stationBasis: 'tracking_context' }, language)
    assert.match(just, /5/)
    assert.match(already, language === 'en' ? /exact time unknown/ : /genaue Zeit unbekannt/)
    assert.match(soon[0], /ETA.*15/)
    assert.match(soon[1], language === 'en' ? /inferred/ : /abgeleitet/)
    assert.notEqual(just, already)
  }
})

test('event, mail arrival and application timestamps remain distinct including missing old provenance', () => {
  const times = trackingHistoryTimes({ eventTime: '2026-11-05T13:10:00Z', mailReceivedAt: '2026-11-05T13:12:37Z', recordedAt: '2026-11-05T13:19:24Z' }, 'en')
  assert.deepEqual(times.map(row => row.label), ['Event time', 'Mail received', 'Applied / recorded'])
  assert.match(times[0].value, /14:10:00/)
  assert.match(times[1].value, /14:12:37/)
  assert.match(times[2].value, /14:19:24/)
  assert.equal(trackingHistoryTimes({ eventTime: 'not-a-date' })[0].value, '—')
  assert.equal(trackingHistoryTimes({})[1].value, '—')
  assert.match(trackingHistoryTimes({ derivation: { mailReceivedAt: '2026-11-05T13:12:37Z' } })[1].value, /14:12:37/)
})


test('prior and corrected derivations stay separate and stage history excludes unrelated fields', () => {
  const original = { timeBasis: 'mail_already_arrived' }
  const prior = { timeBasis: 'mail_just_arrived' }
  const field = 'actualArrivalLoadingAt'
  const personal = trackingEventDerivations({ changedFields: [field], oldDerivation: prior, originalAiDerivation: original })
  assert.deepEqual(personal.map(entry => entry.kind), ['original', 'previous'])
  const event = { changedFields: [field, 'actualArrivalUnloadingAt'], oldDerivations: { [field]: prior, actualArrivalUnloadingAt: original } }
  const filtered = trackingEventDerivations(event, [field])
  assert.deepEqual(filtered, [{ kind: 'previous', field, derivation: prior }])
  assert.deepEqual(trackingEventDerivations({}), [])
})

test('assigned status mails expose only valid pending derived proposals without implying automatic application', () => {
  const proposal = { field: 'actualArrivalLoadingAt', value: '2026-11-05T13:10:00Z', requiresConfirmation: true, applied: false, derivation: { timeBasis: 'mail_already_arrived' } }
  assert.deepEqual(trackingReviewProposals([proposal, { ...proposal, applied: true }, { ...proposal, requiresConfirmation: false }, { ...proposal, derivation: null }, null]), [proposal])
  assert.deepEqual(trackingReviewProposals(undefined), [])
})


test('unknown or approximate arrival is never labelled late or punctual from a stale color', () => {
  for (const language of ['de', 'en']) {
    assert.match(trackingArrivalOutcomeLabel({ kind: 'arrival', state: 'unknown' }, language), /unbekannt|unknown/)
    assert.match(trackingArrivalOutcomeLabel({ kind: 'arrival', state: 'green', arrivalTimeApproximate: true }, language), /Zeit unbekannt|time unknown/)
  }
  assert.match(trackingArrivalOutcomeLabel({ state: 'green' }, 'en'), /within/)
  assert.match(trackingArrivalOutcomeLabel({ state: 'yellow' }, 'en'), /after/)
})


test('reply-context provenance is visible without retaining or echoing a question transcript', () => {
  for (const language of ['de', 'en']) {
    const labels = trackingDerivationLabels({ timeBasis: 'explicit', stationBasis: 'reply_context', questionKind: 'unloading_distance', ruleVersion: 2 }, language)
    assert.equal(labels.length, 1)
    assert.match(labels[0], language === 'en' ? /reply to a follow-up question/ : /Antwort auf Rückfrage/)
    assert.ok(!labels[0].includes('unloading_distance'))
  }
  assert.equal(trackingEventDerivations({ changedFields: ['transitEntry'], derivation: { stationBasis: 'reply_context' } }).length, 1)
})

test('pending distance suggestions are bounded and never shown as already applied', () => {
  const proposal = { kilometersToDestination: 80, requiresConfirmation: true, applied: false, derivation: { stationBasis: 'reply_context' } }
  assert.deepEqual(trackingReviewTransitProposals([proposal, { ...proposal, applied: true }, { ...proposal, requiresConfirmation: false }, { ...proposal, kilometersToDestination: -1 }, { ...proposal, kilometersToDestination: 100001 }, { ...proposal, kilometersToDestination: '80' }, null]), [proposal])
  assert.deepEqual(trackingReviewTransitProposals(undefined), [])
})

test('editing a distance, place or report time removes active question-derived provenance until restored', () => {
  const original = { id: 'proposal-0', kind: 'position', at: '2026-11-05T14:10', kilometersToDestination: 80, location: '', requiresConfirmation: true, derivation: { stationBasis: 'reply_context' } }
  assert.deepEqual(trackingUnchangedTransitDerivation({ ...original, kilometersToDestination: '80' }, [original]), original.derivation)
  for (const change of [{ kilometersToDestination: 81 }, { kilometersToDestination: '' }, { at: '2026-11-05T14:11' }, { location: 'Other place' }, { id: 'new-position' }, { kind: 'pause' }]) {
    assert.equal(trackingUnchangedTransitDerivation({ ...original, ...change }, [original]), null)
  }
  assert.equal(trackingUnchangedTransitDerivation(original, []), null)
  assert.equal(trackingUnchangedTransitDerivation({ ...original, at: 'invalid' }, [original]), null)
})
