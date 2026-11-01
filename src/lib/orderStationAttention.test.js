import assert from 'node:assert/strict'
import test from 'node:test'
import { orderStationAddressAttention as attention } from './orderStationAttention.js'

test('neutral instructions apply to their named station action', () => {
  assert.equal(attention({ type: 'loading', note: 'Bitte NEUTRAL abholen!' }), 'Neutrale Abholung')
  assert.equal(attention({ type: 'unloading', note: 'Anlieferung erfolgt neutral.' }), 'Neutrale Anlieferung')
  assert.equal(attention({ type: 'loading', note: 'Neutrale Anlieferung' }), null)
  assert.equal(attention({ type: 'unloading', note: 'Neutrale Abholung' }), null)
  assert.equal(attention({ type: 'loading' }, 'Neutrale Abholung und Anlieferung.'), 'Neutrale Abholung')
  assert.equal(attention({ type: 'unloading' }, 'Neutrale Abholung und Anlieferung.'), 'Neutrale Anlieferung')
  assert.equal(attention({ type: 'unloading' }, 'Bitte neutral abholen und anliefern.'), 'Neutrale Anlieferung')
})

test('negations and unrelated neutral words do not raise an address hint', () => {
  for (const note of ['Nicht neutral abholen.', 'Keine neutrale Abholung erforderlich.', 'Abholung nicht neutral.', 'Neutrale Abholung ist nicht erforderlich.', 'Neutraler Lieferschein', 'Neutrale Verpackung', 'neutraler Auftrag', '', null]) {
    assert.equal(attention({ type: 'loading', note }), null, String(note))
  }
  assert.equal(attention({ type: 'loading', note: 'Keine neutrale Abholung, aber neutral anliefern.' }), null)
  assert.equal(attention({ type: 'unloading', note: 'Keine neutrale Abholung, aber neutral anliefern.' }), 'Neutrale Anlieferung')
})

test('station-scoped shorthand and source flags remain separate', () => {
  assert.equal(attention({ type: 'unloading', note: 'NEUTRAL!' }), 'Neutrale Anlieferung')
  assert.equal(attention({ type: 'unloading', note: 'NEUTRAL!\nAnmeldung am Tor.' }), 'Neutrale Anlieferung')
  assert.equal(attention({ type: 'unloading', note: 'NICHT NEUTRAL!\nAnmeldung am Tor.' }, 'Neutral anliefern'), null)
  assert.equal(attention({ type: 'loading' }, 'NEUTRAL!'), null)
  assert.equal(attention({ type: 'unknown', note: 'Neutrale Abholung' }), null)
  assert.equal(attention({ type: 'loading', fixedAppointment: true, deliveryInformation: 'Neutral abholen' }), null)
  assert.equal(attention({ type: 'loading', note: 'Nicht neutral abholen.' }, 'Neutrale Abholung'), null)
  assert.equal(attention({ type: 'loading', note: 'Neutral abholen.' }, 'Keine neutrale Abholung'), 'Neutrale Abholung')
})
