import assert from 'node:assert/strict'
import test from 'node:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import LiabilityLetterPage from './LiabilityLetterPage.jsx'
import { CompanyDataContext } from '../company/companyDataContext.js'
import { LanguageContext } from '../i18n/languageContext.js'
import { DEFAULT_COMPANY_DATA } from '../lib/companyDataModel.js'

const order = number => ({
  id: `dycos-${number}`, externalNumber: number,
  carrier: { company: `Frachtführer ${number}`, street: 'Speditionsweg 1', postalCode: '12345', city: 'Berlin', country: 'DE' },
  stops: [
    { id: 'loading-1', type: 'loading', company: 'Versender GmbH', street: 'Ladeweg 2', postalCode: '23456', city: 'Hamburg', country: 'DE', date: '2026-11-01' },
    { id: 'unloading-1', type: 'unloading', company: 'Empfänger GmbH', street: 'Zielweg 3', postalCode: '34567', city: 'Bremen', country: 'DE', date: '2026-11-02' },
  ], warningCodes: [],
})

async function mount() {
  globalThis.__liabilityUiTest = { calls: [], pdf: [] }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<MemoryRouter initialEntries={['/vorlagen/haftbarhaltung']}><LanguageContext.Provider value={{ language: 'de', t: key => ({ 'common.cancel': 'Abbrechen', 'common.confirm': 'Bestätigen', 'common.back': 'Zurück' }[key] || key) }}><CompanyDataContext.Provider value={{ company: DEFAULT_COMPANY_DATA, loading: false, error: '' }}><LiabilityLetterPage /></CompanyDataContext.Provider></LanguageContext.Provider></MemoryRouter>))
  return async () => { await act(async () => root.unmount()); container.remove() }
}
function input(labelText) {
  const label = [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith(labelText))
  assert.ok(label, `Missing field: ${labelText}`)
  const field = label.querySelector('input, textarea')
  assert.ok(field, `Missing input: ${labelText}`)
  return field
}
function button(pattern) {
  const matches = [...document.querySelectorAll('button')].filter(item => pattern.test(item.textContent.trim()))
  assert.equal(matches.length, 1, `Expected exactly one button ${pattern}, found ${matches.length}`)
  return matches[0]
}
async function enter(field, value) {
  const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function click(element) {
  assert.equal(element.disabled, false, `Disabled button: ${element.textContent}`)
  await act(async () => element.click())
}
function call(name) {
  const result = globalThis.__liabilityUiTest.calls.find(item => item.name === name && !item.handled)
  assert.ok(result, `Missing callable ${name}`)
  result.handled = true
  return result
}
async function resolve(pending, value) { await act(async () => pending.resolve(value)) }
async function reject(pending, error) { await act(async () => pending.reject(error)) }
function assertSingletons(withStops = true) {
  assert.equal(document.querySelectorAll('#liability-order-heading').length, 1, 'Search section duplicated')
  assert.equal(document.querySelectorAll('#liability-form-heading').length, 1, 'Letter form duplicated')
  if (withStops) assert.equal(document.querySelectorAll('#liability-stops-heading').length, 1, 'Stop selection duplicated')
  assert.equal(document.querySelectorAll('[aria-label="Dokumentvorschau Haftbarhaltung"]').length, 1, 'Preview duplicated')
}
async function search(number, result) {
  await enter(input('TA-Nummer'), number)
  await click(button(/^In Drehpunkt suchen$/))
  const request = call('findLiabilityTransportOrders')
  assert.equal(request.data.taNummer, number)
  await resolve(request, { orders: result })
}
async function startImport(number = '261000123') {
  await search(number, [])
  assert.match(document.body.textContent, /nicht.*Drehpunkt|Kein Auftrag/)
  await click(button(/Ja,.*importieren|Aus DyCoS.*(?:importieren|abrufen)/i))
  return call('fetchLiabilityTransportOrder')
}

for (const first of ['import', 'wording']) {
  test(`pending import preserves editable text/date and concurrent wording when ${first} completes first`, async () => {
    const errors = []
    const originalError = console.error
    console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args) }
    const cleanup = await mount()
    try {
      const pendingImport = await startImport()
      const locked = [...document.querySelectorAll('fieldset[disabled]')]
      assert.ok(locked.some(fieldset => fieldset.querySelector('input')), 'Order fields must be disabled as a group')
      for (const field of document.querySelectorAll('.liability-order-fields input, .liability-order-fields textarea')) assert.equal(field.matches(':disabled'), true, 'An order input remained editable during import')
      const overlay = document.querySelector('.liability-order-fields__overlay')
      assert.ok(overlay, 'Import must show an overlay over order fields')
      assert.match(overlay.textContent, /importiert|Import|geladen|abgerufen/)
      assert.equal(input('Belegdatum').matches(':disabled'), false)
      assert.equal(input('Sachverhalt').matches(':disabled'), false)
      await enter(input('Belegdatum'), '2026-11-03')
      await enter(input('Sachverhalt'), 'Die Ware wurde beim Transport beschädigt.')
      await click(button(/^Vorschlag für Formulierung$/))
      const pendingWording = call('suggestLiabilityWording')
      assert.equal(pendingWording.data.incidentSummary, 'Die Ware wurde beim Transport beschädigt.')
      const wording = 'Im Rahmen der Transportdurchführung kam es zu einer Beschädigung der Ware.'
      if (first === 'import') {
        await resolve(pendingImport, { order: order('261000123'), importStatus: 'new' })
        await resolve(pendingWording, { incidentText: wording })
      } else {
        await resolve(pendingWording, { incidentText: wording })
        await click(button(/^Formulierung übernehmen$/))
        assert.equal(input('Sachverhalt').value, wording)
        await resolve(pendingImport, { order: order('261000123'), importStatus: 'new' })
      }
      assert.equal(input('Belegdatum').value, '2026-11-03')
      assert.equal(input('Sachverhalt').value, first === 'wording' ? wording : 'Die Ware wurde beim Transport beschädigt.')
      assert.equal(document.querySelector('.liability-order-fields__overlay'), null)
      assert.equal(document.querySelector('[role="alertdialog"]'), null, 'Concurrent text entry must not cause an import acceptance dialog')
      assert.ok([...document.querySelectorAll('input')].some(field => field.value === 'Frachtführer 261000123'))
      assert.ok([...document.querySelectorAll('input')].some(field => field.value === 'Ladeweg 2'))
      assert.match(document.querySelector('[aria-label="Dokumentvorschau Haftbarhaltung"]').textContent, /Versender GmbH/)
      if (first === 'import') await click(button(/^Formulierung übernehmen$/))
      assert.equal(input('Sachverhalt').value, wording)
      await click(button(/^Formulierung rückgängig machen$/))
      assert.equal(input('Sachverhalt').value, 'Die Ware wurde beim Transport beschädigt.')
      assertSingletons()
      assert.equal(errors.some(error => /same key|unique.*key/i.test(error)), false, 'React duplicate-key warnings')
    } finally { await cleanup(); console.error = originalError }
  })
}

test('repeated order selections keep exactly one search, form, stop editor and preview', async () => {
  const cleanup = await mount()
  try {
    for (const number of ['261000123', '261000124', '261000125']) {
      await search(number, [order(number)])
      const result = [...document.querySelectorAll('button')].find(item => item.textContent.includes(`TA ${number}`))
      if (result) await click(result)
      const dialog = document.querySelector('[role="alertdialog"]')
      if (dialog) await click([...dialog.querySelectorAll('button')].find(item => /Übernehmen|Bestätigen/.test(item.textContent)))
      assertSingletons()
      assert.ok([...document.querySelectorAll('input')].some(field => field.value === `Frachtführer ${number}`))
    }
  } finally { await cleanup() }
})

test('failed import unlocks order fields, keeps the editable draft and retries the same request', async () => {
  const cleanup = await mount()
  try {
    const pendingImport = await startImport()
    await enter(input('Sachverhalt'), 'Fahrzeug nicht erschienen.')
    await enter(input('Belegdatum'), '2026-11-02')
    const requestId = pendingImport.data.requestId
    await reject(pendingImport, { code: 'functions/unavailable' })
    assert.equal(input('Sachverhalt').value, 'Fahrzeug nicht erschienen.')
    assert.equal(input('Belegdatum').value, '2026-11-02')
    assert.equal(document.querySelector('.liability-order-fields__overlay'), null)
    await click(button(/Ja,.*importieren|Aus DyCoS.*(?:importieren|abrufen)/i))
    const retry = call('fetchLiabilityTransportOrder')
    assert.equal(retry.data.requestId, requestId)
    await resolve(retry, { order: order('261000123'), importStatus: 'new' })
    assertSingletons()
    assert.equal(input('Sachverhalt').value, 'Fahrzeug nicht erschienen.')
  } finally { await cleanup() }
})

test('a subsequent import locks the existing stop editors and replaces their values without touching the draft', async () => {
  const cleanup = await mount()
  try {
    await search('261000123', [order('261000123')])
    await click(button(/TA 261000123/))
    await enter(input('Sachverhalt'), 'Ware beschädigt.')
    const pendingImport = await startImport('261000126')
    const stopFields = document.querySelectorAll('.liability-stops input')
    assert.ok(stopFields.length > 0)
    for (const field of stopFields) assert.equal(field.matches(':disabled'), true)
    await enter(input('Sachverhalt'), 'Ware beschädigt, bitte Versicherung informieren.')
    await resolve(pendingImport, { order: { ...order('261000126'), stops: order('261000126').stops.map(stop => ({ ...stop, street: 'Neue Anschrift 4' })) }, importStatus: 'new' })
    assert.equal(input('Sachverhalt').value, 'Ware beschädigt, bitte Versicherung informieren.')
    assertSingletons()
    assert.equal(document.querySelector('[role="alertdialog"]'), null)
    assert.ok([...document.querySelectorAll('input')].some(field => field.value === 'Neue Anschrift 4'))
  } finally { await cleanup() }
})

test('missing imported addresses remain visible as missing and require review before PDF output', async () => {
  const cleanup = await mount()
  try {
    const incomplete = order('261000123')
    incomplete.stops = incomplete.stops.map(stop => ({ ...stop, company: '', street: '', postalCode: '', city: '', country: '' }))
    await search('261000123', [incomplete])
    await click(button(/TA 261000123/))
    await enter(input('Sachverhalt'), 'Ware beschädigt.')
    assert.match(document.querySelector('.liability-data-warning').textContent, /unvollständig/)
    await click(button(/^PDF erstellen$/))
    assert.match(document.querySelector('[role="alertdialog"]').textContent, /Unvollständige Angaben/)
    assert.equal(globalThis.__liabilityUiTest.pdf.length, 0)
    await click(button(/^Abbrechen$/))
    assert.equal(globalThis.__liabilityUiTest.pdf.length, 0)
  } finally { await cleanup() }
})
