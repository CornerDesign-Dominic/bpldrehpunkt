import test from 'node:test'
import assert from 'node:assert/strict'
import { getStatusMailReplyContext, statusReplyFieldBasis, replyAffirmsArrival, replyDistanceBasis, statusReplyArrivalCandidate } from './statusMailReplyContext.js'

const mail = (bodyText, question, extra = {}) => ({ bodyText, quotedContext: `\nFrom: Dispatcher <dispatch@example.invalid>\nSent: Thursday, 5 November 2026 12:00\nTo: Carrier <carrier@example.invalid>\nSubject: TA 123456789\n\n${question}`, ...extra })

test('the actual bilingual question is read once, excluding its headers, footer and planned times', () => {
  const current = mail('Ja.', 'Hallo,\nIst das Fahrzeug an der Ladestelle?\n\nIs the vehicle at the loading place?\n\nLadestelle / Loading site: Hamburg\nTermin / Time slot: 05.11.2026, 14:00 Uhr')
  const context = getStatusMailReplyContext(current)
  assert.deepEqual(context.topics, ['loading_arrival'])
  assert.equal(context.station, 'loading')
  assert.ok(!context.questionText.includes('14:00'))
  assert.ok(!context.questionText.includes('Dispatcher'))
  assert.equal(replyAffirmsArrival(current, 'Ja.', 'actualArrivalLoadingAt'), true)
  assert.equal(replyAffirmsArrival(current, 'Ja.', 'actualArrivalUnloadingAt'), false)
  assert.deepEqual(statusReplyFieldBasis('actualArrivalLoadingAt', current, 'Ja.'), { topic: 'loading_arrival', station: 'loading', questionKind: 'loading_arrival' })
})

test('short affirmative replies require one unambiguous arrival confirmation question', () => {
  for (const answer of ['Ja', 'yes.', 'Ja, ist er.', 'Yes, he is.', 'Oui', 'tak']) {
    const current = mail(answer, 'Has the vehicle arrived at the unloading point?')
    assert.equal(replyAffirmsArrival(current, answer, 'actualArrivalUnloadingAt'), true, answer)
  }
  for (const question of [
    'Läuft alles nach Plan? Habt Ihr eine Ankunftszeit für uns?\nLadestelle / Loading site: Hamburg',
    'Könnt ihr das Kennzeichen und die Ankunft an der Ladestelle mitteilen?',
    'Ist das Fahrzeug an der Ladestelle? Ist die Beladung abgeschlossen?',
    'Wann kommt Ihr etwa an der Ladestelle an?',
    'Bitte ein Update zur Beladung, oder ist das Fahrzeug schon abgefahren. Bitte um Abfahrtszeit.',
  ]) assert.equal(replyAffirmsArrival(mail('Ja', question), 'Ja', 'actualArrivalLoadingAt'), false, question)
})

test('current explicit arrived statements can answer an ETA/update question, but a vague yes cannot', () => {
  for (const question of ['Wann kommt Ihr etwa an der Ladestelle an?', 'Please provide a brief update on the loading.', 'Could you send the license plate and expected arrival at loading?']) {
    const current = mail('LKW ist da.', question)
    assert.equal(statusReplyFieldBasis('actualArrivalLoadingAt', current, 'LKW ist da.').station, 'loading')
    assert.equal(replyAffirmsArrival(current, 'LKW ist da.', 'actualArrivalLoadingAt'), true)
  }
  const english = mail('Already arrived.', 'When is the vehicle expected to arrive at the unloading point?')
  assert.equal(replyAffirmsArrival(english, 'Already arrived.', 'actualArrivalUnloadingAt'), true)
  assert.equal(statusReplyFieldBasis('actualArrivalLoadingAt', english, 'Already arrived.'), null)
})

test('a bare numeric reply acquires kilometers only from the unique current distance question', () => {
  for (const question of ['Wie viel Kilometer sind noch bis zur Entladestelle?', 'How many kilometers are left until the unloading point?', 'Wie viel Kilometer sind noch bis zur Entladestelle?\nHow many kilometers are left until the unloading point?']) {
    const current = mail('80', question)
    assert.deepEqual(replyDistanceBasis(current, '80'), { topic: 'unloading_distance', station: 'unloading', unit: 'km' })
  }
  assert.equal(replyDistanceBasis(mail('80', 'When will the vehicle arrive at unloading?'), '80'), null)
  assert.equal(replyDistanceBasis(mail('80', 'How many kilometers are left to unloading? And what is the ETA at unloading?'), '80'), null)
  assert.equal(replyDistanceBasis(mail('80', 'How many minutes are left until unloading?'), '80'), null)
  assert.equal(replyDistanceBasis(mail('10:00', 'How many kilometers are left to unloading?'), '10:00'), null)
})

test('a reply time follows the actual asked topic rather than the current transport stage', () => {
  const current = mail('14:00 Uhr', 'Wann kommt Ihr etwa an der Ladestelle an?', { tracking: { stageId: 'unloading' } })
  assert.equal(statusReplyFieldBasis('estimatedArrivalLoadingAt', current, '14:00 Uhr').topic, 'loading_eta')
  assert.equal(statusReplyFieldBasis('estimatedArrivalUnloadingAt', current, '14:00 Uhr'), null)
  const departure = mail('Abfahrt 10:15 Uhr', 'Bitte ein kurzes Update zur Beladung, oder ist das Fahrzeug schon abgefahren. Bitte um Abfahrtszeit.')
  assert.equal(statusReplyFieldBasis('actualDepartureLoadingAt', departure, 'Abfahrt 10:15 Uhr').topic, 'loading_departure')
  assert.equal(statusReplyFieldBasis('actualArrivalLoadingAt', departure, 'Abfahrt 10:15 Uhr'), null)
})

test('fallback reads the nearest Outlook/On-wrote quote from the existing body, never an older question', () => {
  const bodyText = 'Ja.\n\nOn Thu, Dispatcher wrote:\nIst das Fahrzeug an der Ladestelle?\n\nOn Wed, Dispatcher wrote:\nIst das Fahrzeug an der Entladestelle angekommen?'
  assert.deepEqual(getStatusMailReplyContext({ bodyText }).topics, ['loading_arrival'])
  assert.equal(replyAffirmsArrival({ bodyText }, 'Ja.', 'actualArrivalLoadingAt'), true)
  const notQuestion = 'Ja.\nOn Thu, Carrier wrote:\nDie letzte Meldung war korrekt.\nOn Wed, Dispatcher wrote:\nIst das Fahrzeug an der Ladestelle?'
  assert.equal(getStatusMailReplyContext({ bodyText: notQuestion }), null)
})

test('plain greater-than quotes and nested older quote levels are bounded', () => {
  const current = { bodyText: 'Yes.\n> Is the vehicle at the unloading place?\n>\n>> Is the vehicle at the loading place?' }
  assert.deepEqual(getStatusMailReplyContext(current).topics, ['unloading_arrival'])
  assert.equal(replyAffirmsArrival(current, 'Yes.', 'actualArrivalUnloadingAt'), true)
})

test('old quoted answers, missing quotes, questions and negative replies do not become current arrival facts', () => {
  const current = mail('Nein.', 'Ist das Fahrzeug an der Ladestelle?\nJa.')
  assert.equal(replyAffirmsArrival(current, 'Ja.', 'actualArrivalLoadingAt'), false)
  assert.equal(replyAffirmsArrival(current, 'Nein.', 'actualArrivalLoadingAt'), false)
  assert.equal(replyAffirmsArrival(mail('Ist er angekommen?', 'Ist das Fahrzeug an der Ladestelle?'), 'Ist er angekommen?', 'actualArrivalLoadingAt'), false)
  assert.equal(getStatusMailReplyContext({ bodyText: 'Ist das Fahrzeug an der Ladestelle?' }), null)
  assert.equal(replyAffirmsArrival({ bodyText: 'Ja.' }, 'Ja.', 'actualArrivalLoadingAt'), false)
})

test('an explicitly different current reply stop prevents forcing the asked stop', () => {
  const current = mail('Bereits an der Entladestelle angekommen.', 'Ist das Fahrzeug an der Ladestelle?')
  assert.equal(statusReplyFieldBasis('actualArrivalLoadingAt', current, current.bodyText), null)
})

test('verified current transport rejects a different or multiply referenced nearest quoted order', () => {
  const current = mail('Ja.', 'Ist das Fahrzeug an der Ladestelle?', { transportOrderNumber: '987654321' })
  assert.equal(getStatusMailReplyContext(current), null)
  const correct = mail('Ja.', 'Ist das Fahrzeug an der Ladestelle?', { transportOrderNumber: '123456789' })
  assert.equal(replyAffirmsArrival(correct, 'Ja.', 'actualArrivalLoadingAt'), true)
  const multiple = mail('Ja.', 'Ist das Fahrzeug für TA 123456789 oder Transportauftrag 987654321 an der Ladestelle?', { transportOrderNumber: '123456789' })
  assert.equal(getStatusMailReplyContext(multiple), null)
  const noFalseNumber = mail('Ja.', 'Ist das Fahrzeug an der Ladestelle? Telefon: 123456789', { transportOrderNumber: '123456789' })
  assert.ok(getStatusMailReplyContext(noFalseNumber))
})


test('an unquoted reply marker does not turn the first quoted body into an older nested message', () => {
  for (const current of [
    { bodyText: 'Ja.\nOn Thu, Dispatcher wrote:\n> Is the vehicle at the loading place?' },
    { bodyText: 'Ja.', quotedContext: 'On Thu, Dispatcher wrote:\n> Is the vehicle at the loading place?' },
    { bodyText: 'Ja.', quotedContext: 'From: Dispatcher\nSent: Thursday\nTo: Carrier\nSubject: TA 123456789\n\n> Is the vehicle at the loading place?\n>> Was it at unloading yesterday?' },
  ]) {
    assert.deepEqual(getStatusMailReplyContext(current).topics, ['loading_arrival'])
    assert.equal(replyAffirmsArrival(current, 'Ja.', 'actualArrivalLoadingAt'), true)
  }
})


test('a cherry-picked Ja cannot hide a contradictory or unrelated current answer', () => {
  for (const answer of ['Ja.\nFahrer ist aber noch nicht dort.', 'Ja, Anfrage erhalten.', 'Ja. Danke für die Anfrage.', 'Ja. The driver has not arrived yet.', 'Ja, aber er ist nicht da.']) {
    const current = mail(answer, 'Ist das Fahrzeug an der Ladestelle?')
    assert.equal(replyAffirmsArrival(current, 'Ja', 'actualArrivalLoadingAt'), false, answer)
    assert.equal(statusReplyArrivalCandidate(current), null, answer)
  }
  const valid = mail('Ja, LKW ist da, aber noch nicht abgefahren.', 'Ist das Fahrzeug an der Ladestelle?')
  assert.equal(replyAffirmsArrival(valid, 'Ja', 'actualArrivalLoadingAt'), true)
})

test('deterministic arrival fallback uses a whole concise current answer and one question-resolved stop', () => {
  const current = mail('Hallo,\n\nJa.\n\nDanke', 'Ist das Fahrzeug an der Ladestelle?')
  assert.deepEqual(statusReplyArrivalCandidate(current), { field: 'actualArrivalLoadingAt', value: '', evidence: 'Ja.', confidence: 'medium', timeBasis: 'mail_already_arrived', stationBasis: 'reply_context', contextFields: [] })
  const etaAnswer = mail('LKW ist da.', 'When will the vehicle arrive at the unloading point?')
  assert.equal(statusReplyArrivalCandidate(etaAnswer).field, 'actualArrivalUnloadingAt')
  assert.equal(statusReplyArrivalCandidate(mail('Ja', 'Läuft alles nach Plan? Habt Ihr eine Ankunftszeit?\nLadestelle / Loading site: Hamburg')), null)
  for (const answer of ['LKW ist seit 14:00 da.', 'LKW ist vor 2 Stunden angekommen.', 'Ja, um 14 Uhr.', 'LKW ist da?']) assert.equal(statusReplyArrivalCandidate(mail(answer, 'Ist das Fahrzeug an der Ladestelle?')), null, answer)
})

test('loading completed is not departure even when the original request asks about both', () => {
  for (const answer of ['Fertig um 14 Uhr.', 'Loaded at 14:00.', 'Loading completed at 14:00.']) {
    const current = mail(answer, 'Bitte ein Update zur Beladung, oder ist das Fahrzeug schon abgefahren. Bitte um Abfahrtszeit.')
    assert.equal(statusReplyFieldBasis('actualDepartureLoadingAt', current, answer), null)
    assert.equal(statusReplyFieldBasis('loadingCompletedAt', current, answer).topic, 'loading_update')
  }
  const departed = mail('Departed at 14:00.', 'Please provide a brief update regarding loading—or has the vehicle already departed? Could you please share the departure time?')
  assert.equal(statusReplyFieldBasis('actualDepartureLoadingAt', departed, departed.bodyText).topic, 'loading_departure')
  assert.equal(statusReplyFieldBasis('loadingCompletedAt', departed, departed.bodyText), null)
})


test('a negative or future clock answer to an arrival question grounds only a reviewable ETA, never an actual arrival', () => {
  for (const [answer, question] of [
    ['Nein, um 14 Uhr.', 'Ist das Fahrzeug an der Ladestelle?'],
    ['No, at 14:00.', 'Is the vehicle at the loading place?'],
    ['Noch nicht, um 15 Uhr.', 'Ist das Fahrzeug an der Ladestelle?'],
    ['Not yet, at 15:00.', 'Is the vehicle at the loading place?'],
    ['Kommt um 14:00.', 'Ist das Fahrzeug an der Ladestelle?'],
    ['He will arrive at 14:00.', 'Has the vehicle arrived at the loading point?'],
  ]) {
    const current = mail(answer, question)
    assert.equal(statusReplyFieldBasis('actualArrivalLoadingAt', current, answer), null, answer)
    assert.equal(statusReplyFieldBasis('estimatedArrivalLoadingAt', current, answer).topic, 'loading_arrival', answer)
    assert.equal(statusReplyArrivalCandidate(current), null)
  }
  assert.equal(statusReplyFieldBasis('estimatedArrivalLoadingAt', mail('Nein.', 'Ist das Fahrzeug an der Ladestelle?'), 'Nein.'), null)
})

test('a clock alone cannot choose process start or completion from a generic status update request', () => {
  const question = 'Bitte um kurzes Update zur Beladung.'
  for (const field of ['loadingStartedAt', 'loadingCompletedAt']) assert.equal(statusReplyFieldBasis(field, mail('14 Uhr', question), '14 Uhr'), null)
  assert.equal(statusReplyFieldBasis('loadingCompletedAt', mail('Fertig um 14 Uhr', question), 'Fertig um 14 Uhr').topic, 'loading_update')
  assert.equal(statusReplyFieldBasis('loadingStartedAt', mail('Fertig um 14 Uhr', question), 'Fertig um 14 Uhr'), null)
  assert.equal(statusReplyFieldBasis('loadingStartedAt', mail('Beladung läuft seit 14 Uhr', question), 'Beladung läuft seit 14 Uhr').topic, 'loading_update')
  assert.equal(statusReplyFieldBasis('loadingCompletedAt', mail('Beladung läuft seit 14 Uhr', question), 'Beladung läuft seit 14 Uhr'), null)
})


test('harmless short affirmative suffixes confirm only a single arrival question', () => {
  for (const answer of ['Ja, alles gut.', 'Ja, alles okay.', 'Yes, no problems.', 'Yes, all good.', 'Yes, no issues.']) {
    const current = mail(answer, 'Ist das Fahrzeug an der Ladestelle?')
    assert.equal(replyAffirmsArrival(current, answer, 'actualArrivalLoadingAt'), true, answer)
    assert.equal(statusReplyArrivalCandidate(current).field, 'actualArrivalLoadingAt', answer)
    assert.equal(statusReplyArrivalCandidate(mail(answer, 'Läuft alles nach Plan? Habt Ihr eine Ankunftszeit?\nLadestelle / Loading site: Hamburg')), null, answer)
  }
  assert.equal(statusReplyArrivalCandidate(mail('Ja, Anfrage erhalten.', 'Ist das Fahrzeug an der Ladestelle?')), null)
})
