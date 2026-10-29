import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { buildMailboxOrderXml, emptyMailboxOrder, emptyMailboxOrderStop, mailboxOrderJsonSchema, normalizeMailboxOrder, validateMailboxOrder } from './mailboxOrder.js'

const original = Buffer.from('%PDF-1.7\nOriginal bytes\n%%EOF', 'ascii')
const options = () => ({ customerId: '33', companyCurrency: 'EUR', exportId: 'export-test-00000001', originalPdf: { name: 'Original-Auftrag.pdf', contentBytes: original.toString('base64') } })
function goodOrder() {
  const stop = (type, date, company) => ({ ...emptyMailboxOrderStop(type), id: `${type}-1`, company, street: 'Musterweg 1', country: 'DE', postalCode: '10115', city: 'Berlin', date, timeFrom: '09:30', timeUntil: '11:00', fixed: true, goods: [{ id: 'goods-1', description: 'Maschinen', quantity: 2, packaging: 'Palette', weightKg: 1000, loadingMeters: 1.2, lengthCm: 120, widthCm: 80, heightCm: 100, volumeM3: 1.92 }] })
  return normalizeMailboxOrder({ customerReference: 'REF-42', customerName: 'Kunde GmbH', customerNumber: '10042', vehicleType: 'Sattelzug', loadingDate: '2026-10-29', unloadingDate: '2026-10-30', price: 450.5, currency: 'EUR', contactName: 'Frau Müller', instructions: 'Trocken halten', dispatchNote: '', stops: [stop('loading', '2026-10-29', 'Lader GmbH'), stop('unloading', '2026-10-30', 'Empfänger GmbH')] })
}

test('normalization provides empty values without invented business data and drops unknown fields', () => {
  const order = normalizeMailboxOrder({ ...goodOrder(), FrachtzahlerID: '999', hidden: 'not part of contract' })
  assert.equal(order.FrachtzahlerID, undefined)
  assert.equal(order.hidden, undefined)
  assert.equal(emptyMailboxOrder().price, null)
  assert.equal(emptyMailboxOrder().currency, '')
  assert.deepEqual(emptyMailboxOrder().stops, [])
  assert.equal(mailboxOrderJsonSchema.additionalProperties, false)
  assert.ok(mailboxOrderJsonSchema.required.includes('stops'))
  assert.equal(mailboxOrderJsonSchema.properties.stops.items.additionalProperties, false)
})

test('critical missing data, bad dates and unsupported values remain visible and block export', () => {
  const missing = validateMailboxOrder(emptyMailboxOrder())
  for (const path of ['customerReference', 'customerName', 'customerNumber', 'loadingDate', 'unloadingDate', 'price', 'stops']) assert.ok(missing.some(issue => issue.path === path && issue.severity === 'error'))
  assert.throws(() => normalizeMailboxOrder({ price: '450,50' }), /Ungültige Zahl/)
  assert.throws(() => normalizeMailboxOrder({ price: -1 }), /Ungültige Zahl/)
  assert.throws(() => normalizeMailboxOrder({ customerName: 'A'.repeat(256) }), /Ungültige Angabe/)
  assert.throws(() => normalizeMailboxOrder({ customerName: `A${String.fromCharCode(0)}B` }), /Ungültige Angabe/)
  const order = goodOrder(); order.stops[0].date = '2026-02-30'
  assert.ok(validateMailboxOrder(order).some(issue => issue.path === 'stops.0.date' && issue.severity === 'error'))
  assert.throws(() => buildMailboxOrderXml(order, options()), /Datum/)
})

test('dates and time windows cannot be silently shifted or turned into guessed midnight values', () => {
  const order = goodOrder(); order.stops[0].timeFrom = ''; order.stops[0].timeUntil = ''; order.stops[0].fixed = false
  const xml = buildMailboxOrderXml(order, options())
  const firstStop = xml.slice(xml.indexOf('<Ladestelle>'), xml.indexOf('</Ladestelle>'))
  assert.match(firstStop, /<Termin>29\.10\.2026<\/Termin>/)
  assert.equal(firstStop.includes('Ankunft_Plan'), false)
  assert.equal(xml.includes('<Ladezeit>'), false)
  const invalid = goodOrder(); invalid.stops[0].timeUntil = '08:00'
  assert.ok(validateMailboxOrder(invalid).some(issue => issue.path === 'stops.0.timeUntil'))
  invalid.stops[0].timeUntil = '25:00'
  assert.ok(validateMailboxOrder(invalid).some(issue => issue.path === 'stops.0.timeUntil'))
})

test('XML follows GEHR order, verified customer ID and immutable original PDF bytes', () => {
  const order = goodOrder()
  assert.deepEqual(validateMailboxOrder(order, { companyCurrency: 'EUR' }), [])
  const xml = buildMailboxOrderXml(order, options())
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="iso-8859-1"?>'))
  assert.equal((xml.match(/<Auftrag>/g) || []).length, 1)
  assert.match(xml, /<Quelle>KI<\/Quelle>/)
  assert.match(xml, /<FrachtzahlerID>33<\/FrachtzahlerID>/)
  assert.equal(xml.includes('<Kundennummer>'), false)
  assert.equal(xml.includes('<Adressstamm>'), false)
  assert.match(xml, /<Frachtbetrag>450\.50<\/Frachtbetrag>/)
  const base64 = xml.match(/<DateiData>([^<]+)<\/DateiData>/)[1]
  assert.deepEqual(Buffer.from(base64, 'base64'), original)
  const orderedTags = ['<Quelle>', '<LadeDatum>', '<EntladeDatum>', '<Ladezeit>', '<Entladezeit>', '<Fahrzeugart>', '<Referenznummer>', '<Vorschriften>', '<DateiData>', '<Dateityp>', '<DateinameOriginal>', '<FrachtzahlerID>', '<Frachtbetrag>', '<Ansprechpartner>', '<Ladestelle>', '<Entladestelle>']
  assert.deepEqual(orderedTags.map(tag => xml.indexOf(tag)), orderedTags.map(tag => xml.indexOf(tag)).toSorted((a, b) => a - b))
  assert.match(xml, /<Bruttogewicht>1000<\/Bruttogewicht>/)
  assert.match(xml, /<LaengeWare_cm>120<\/LaengeWare_cm>/)
})

test('Latin-1 transport preserves umlauts and XML escapes while replacing apostrophes as documented', () => {
  const order = goodOrder(); order.instructions = 'Müller & Söhne <Tor "A"> O\'Brien'
  const xml = buildMailboxOrderXml(order, options())
  assert.match(xml, /Müller &amp; Söhne &lt;Tor &quot;A&quot;&gt; O´Brien/)
  const bytes = Buffer.from(xml, 'latin1')
  assert.ok(bytes.includes(Buffer.from([0xfc])))
  assert.equal(bytes.toString('latin1'), xml)
  assert.equal(bytes.includes(Buffer.from([0xc3, 0xbc])), false)
  order.instructions = 'Nicht still verlieren: € 🚚'
  assert.ok(validateMailboxOrder(order).some(issue => issue.path === 'instructions' && issue.severity === 'error'))
  assert.throws(() => buildMailboxOrderXml(order, options()), /ISO-8859-1/)
})

test('currency must be confirmed and equal to the DyCoS company currency; missing price is never zero', () => {
  const order = goodOrder()
  assert.throws(() => buildMailboxOrderXml(order, { ...options(), companyCurrency: undefined }), /Firmenwährung/)
  assert.throws(() => buildMailboxOrderXml(order, { ...options(), companyCurrency: 'USD' }), /Firmenwährung/)
  order.price = null; order.currency = ''
  assert.throws(() => buildMailboxOrderXml(order, options()), /Frachtpreis/)
  const xml = buildMailboxOrderXml(order, { ...options(), allowMissingPrice: true })
  assert.equal(xml.includes('<Frachtbetrag>'), false)
  order.price = 0; order.currency = 'EUR'
  assert.match(buildMailboxOrderXml(order, options()), /<Frachtbetrag>0\.00<\/Frachtbetrag>/)
})

test('multiple positions export station total lademeter on first goods entry only, preserving station order', () => {
  const order = goodOrder()
  order.stops[0].goods.push({ ...order.stops[0].goods[0], id: 'goods-2', description: 'Kartons', loadingMeters: 0.8 })
  const extra = { ...structuredClone(order.stops[0]), id: 'loading-2', company: 'Zweite Ladestelle', goods: [order.stops[0].goods[0]] }
  order.stops.splice(1, 0, extra)
  const xml = buildMailboxOrderXml(order, options())
  const firstStop = xml.slice(xml.indexOf('<Ladestelle>'), xml.indexOf('</Ladestelle>'))
  assert.equal((firstStop.match(/<Lademeter>/g) || []).length, 1)
  assert.match(firstStop, /<Lademeter>2<\/Lademeter>/)
  assert.ok(xml.indexOf('Zweite Ladestelle') < xml.indexOf('<Entladestelle>'))
  order.stops[0].goods[1].loadingMeters = null
  assert.ok(validateMailboxOrder(order).some(issue => issue.path === 'stops.0.goods' && issue.severity === 'error'))
})

test('unverified customer IDs, malformed originals and excessive sizes cannot produce XML', () => {
  for (const customerId of ['', '0', '001', '-1', '2147483648', 33]) assert.throws(() => buildMailboxOrderXml(goodOrder(), { ...options(), customerId }), /Adress-ID/)
  for (const originalPdf of [{ name: 'missing.pdf', contentBytes: '' }, { name: '../original.pdf', contentBytes: original.toString('base64') }, { name: 'original.docx', contentBytes: original.toString('base64') }, { name: 'original.pdf', contentBytes: Buffer.from('not a PDF').toString('base64') }, { name: '原本.pdf', contentBytes: original.toString('base64') }]) assert.throws(() => buildMailboxOrderXml(goodOrder(), { ...options(), originalPdf }), /Original-PDF/)
  assert.throws(() => normalizeMailboxOrder({ stops: Array.from({ length: 13 }, () => emptyMailboxOrderStop()) }), /zwölf/)
})
