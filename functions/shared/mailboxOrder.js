// Business values stay independent of GEHR tag names. Only the export boundary
// maps them to the externally documented representation.
const textLimits = {
  customerReference: 255, customerName: 255, customerNumber: 30, vehicleType: 255,
  loadingDate: 10, unloadingDate: 10, currency: 3, contactName: 255,
  instructions: 4000, dispatchNote: 4000,
}
const stopTextLimits = {
  id: 80, company: 255, street: 255, country: 2, postalCode: 40, city: 255,
  date: 10, timeFrom: 5, timeUntil: 5, reference: 255, contactName: 255,
  contactEmail: 255, contactPhone: 255, note: 4000,
}
const goodsTextLimits = { id: 80, description: 255, packaging: 255 }
const goodsNumbers = ['quantity', 'weightKg', 'loadingMeters', 'lengthCm', 'widthCm', 'heightCm', 'volumeM3']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const permittedControl = code => [9, 10, 13].includes(code)
const invalidControl = value => [...value].some(character => { const code = character.codePointAt(0); return code < 32 && !permittedControl(code) || code >= 127 && code <= 159 })
const outsideLatin1 = value => [...value].some(character => { const code = character.codePointAt(0); return code > 255 || code < 32 && !permittedControl(code) || code >= 127 && code <= 159 })
const text = (value, limit, path) => {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.length > limit || invalidControl(value)) throw new Error(`Ungültige Angabe: ${path}`)
  return value.trim()
}
const numeric = (value, path) => {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new Error(`Ungültige Zahl: ${path}`)
  return Object.is(value, -0) ? 0 : value
}
const textObject = (value, limits, prefix = '') => Object.fromEntries(Object.entries(limits).map(([field, limit]) => [field, text(value[field], limit, `${prefix}${field}`)]))
const textSchema = limits => Object.fromEntries(Object.entries(limits).map(([key, maxLength]) => [key, { type: 'string', maxLength }]))
const numberSchema = { type: ['number', 'null'], minimum: 0, maximum: 1_000_000_000 }
const goodsProperties = { ...textSchema(goodsTextLimits), ...Object.fromEntries(goodsNumbers.map(field => [field, numberSchema])) }
const stopProperties = { ...textSchema(stopTextLimits), type: { type: 'string', enum: ['loading', 'unloading'] }, fixed: { type: 'boolean' }, goods: { type: 'array', maxItems: 30, items: { type: 'object', additionalProperties: false, required: Object.keys(goodsProperties), properties: goodsProperties } } }
const orderProperties = { ...textSchema(textLimits), price: numberSchema, stops: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: Object.keys(stopProperties), properties: stopProperties } } }

export const mailboxOrderJsonSchema = { type: 'object', additionalProperties: false, required: Object.keys(orderProperties), properties: orderProperties }

export function normalizeMailboxOrder(value = {}) {
  if (!object(value)) throw new Error('Ungültiger Auftrag.')
  if (value.stops !== undefined && (!Array.isArray(value.stops) || value.stops.length > 12)) throw new Error('Höchstens zwölf Lade-/Entladestellen sind möglich.')
  let goodsCount = 0
  const stops = (value.stops || []).map((stop, index) => {
    const prefix = `stops.${index}.`
    if (!object(stop) || !['loading', 'unloading'].includes(stop.type) || stop.fixed !== undefined && typeof stop.fixed !== 'boolean') throw new Error(`Ungültige Station: ${index + 1}`)
    if (stop.goods !== undefined && (!Array.isArray(stop.goods) || stop.goods.length > 30)) throw new Error(`Zu viele Warenpositionen an Station ${index + 1}.`)
    const goods = (stop.goods || []).map((item, itemIndex) => {
      if (!object(item)) throw new Error('Ungültige Warenposition.')
      goodsCount++
      return { ...textObject(item, goodsTextLimits, `${prefix}goods.${itemIndex}.`), ...Object.fromEntries(goodsNumbers.map(field => [field, numeric(item[field], `${prefix}goods.${itemIndex}.${field}`)])) }
    })
    return { ...textObject(stop, stopTextLimits, prefix), type: stop.type, fixed: stop.fixed === true, goods }
  })
  if (goodsCount > 120) throw new Error('Höchstens 120 Warenpositionen sind möglich.')
  return { ...textObject(value, textLimits), price: numeric(value.price, 'price'), stops }
}

export const emptyMailboxOrder = () => normalizeMailboxOrder({})
export const emptyMailboxOrderStop = (type = 'loading') => normalizeMailboxOrder({ stops: [{ type, goods: [{}] }] }).stops[0]
export const emptyMailboxOrderGoods = () => emptyMailboxOrderStop().goods[0]

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '2199-12-31'
}
const validTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)

export function validateMailboxOrder(input, { allowMissingPrice = false, companyCurrency } = {}) {
  const issues = []
  const add = (path, message, severity = 'error') => issues.push({ path, message, severity })
  let order
  try { order = normalizeMailboxOrder(input) } catch (error) { add('', error.message); return issues }
  for (const [field, label] of [['customerReference', 'Kundenreferenz'], ['customerName', 'Frachtzahler'], ['customerNumber', 'Debitorennummer']]) if (!order[field]) add(field, `${label} fehlt.`)
  if (order.customerNumber && !/^[1-9]\d{0,29}$/.test(order.customerNumber)) add('customerNumber', 'Die Debitorennummer muss eindeutig und numerisch sein.')
  for (const field of ['loadingDate', 'unloadingDate']) if (!validDate(order[field])) add(field, 'Ein gültiges Datum ist erforderlich.')
  if (validDate(order.loadingDate) && validDate(order.unloadingDate) && order.unloadingDate < order.loadingDate) add('unloadingDate', 'Das Entladedatum liegt vor dem Ladedatum.')
  if (order.price === null) add('price', 'Frachtpreis fehlt. Eine ausdrückliche Bestätigung für den Export ohne Preis ist erforderlich.', allowMissingPrice ? 'warning' : 'error')
  else {
    if (Math.abs(order.price * 100 - Math.round(order.price * 100)) > 0.00001) add('price', 'Der Frachtpreis darf höchstens zwei Nachkommastellen enthalten.')
    if (!/^[A-Z]{3}$/.test(order.currency)) add('currency', 'Die Preiswährung fehlt oder ist ungültig.')
    if (companyCurrency !== undefined && (!/^[A-Z]{3}$/.test(companyCurrency) || order.currency !== companyCurrency)) add('currency', 'Die Preiswährung muss der bestätigten DyCoS-Firmenwährung entsprechen. Es erfolgt keine Umrechnung.')
  }
  for (const type of ['loading', 'unloading']) if (!order.stops.some(stop => stop.type === type)) add('stops', type === 'loading' ? 'Mindestens eine Ladestelle ist erforderlich.' : 'Mindestens eine Entladestelle ist erforderlich.')
  const firstLoading = order.stops.find(stop => stop.type === 'loading')
  const lastUnloading = order.stops.filter(stop => stop.type === 'unloading').at(-1)
  if (firstLoading?.date && firstLoading.date !== order.loadingDate) add('loadingDate', 'Das Auftrags-Ladedatum muss dem Datum der ersten Ladestelle entsprechen.')
  if (lastUnloading?.date && lastUnloading.date !== order.unloadingDate) add('unloadingDate', 'Das Auftrags-Entladedatum muss dem Datum der letzten Entladestelle entsprechen.')
  order.stops.forEach((stop, index) => {
    const prefix = `stops.${index}.`
    for (const field of ['company', 'street', 'country', 'postalCode', 'city']) if (!stop[field]) add(`${prefix}${field}`, 'Die vollständige Lade-/Entladeanschrift fehlt.')
    if (stop.country && !/^[A-Z]{2}$/.test(stop.country)) add(`${prefix}country`, 'Das Land ist als zweistelliger ISO-Ländercode erforderlich.')
    if (!validDate(stop.date)) add(`${prefix}date`, 'Das Datum der Station fehlt oder ist ungültig.')
    else if (validDate(order.loadingDate) && validDate(order.unloadingDate) && (stop.date < order.loadingDate || stop.date > order.unloadingDate)) add(`${prefix}date`, 'Das Stationsdatum liegt außerhalb der Auftragsdaten.')
    for (const field of ['timeFrom', 'timeUntil']) if (stop[field] && !validTime(stop[field])) add(`${prefix}${field}`, 'Die Uhrzeit muss im Format HH:mm vorliegen.')
    if (validTime(stop.timeFrom) && validTime(stop.timeUntil) && stop.timeUntil < stop.timeFrom) add(`${prefix}timeUntil`, 'Das Zeitfenster endet vor seinem Beginn. Übernachtfenster müssen eindeutig geklärt werden.')
    if (stop.fixed && !stop.timeFrom) add(`${prefix}timeFrom`, 'Ein Fixtermin benötigt eine bestätigte Uhrzeit.')
    if (stop.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stop.contactEmail)) add(`${prefix}contactEmail`, 'Die E-Mail-Adresse ist ungültig.')
    if (!stop.goods.length) add(`${prefix}goods`, 'Mindestens eine Warenposition ist erforderlich.')
    if (stop.goods.some(item => item.loadingMeters !== null) && stop.goods.some(item => item.loadingMeters === null)) add(`${prefix}goods`, 'Lademeter müssen für jede Warenposition eindeutig vorliegen, damit die Gesamtlademeter der Station nicht unvollständig exportiert werden.')
    stop.goods.forEach((item, itemIndex) => {
      const path = `${prefix}goods.${itemIndex}.`
      if (!item.description) add(`${path}description`, 'Die Warenbeschreibung fehlt.')
      if (item.quantity === null || item.quantity === 0) add(`${path}quantity`, 'Eine positive Warenmenge ist erforderlich.')
      for (const field of goodsNumbers) if (item[field] !== null && Math.abs(item[field] * 1e6 - Math.round(item[field] * 1e6)) > 0.00001) add(`${path}${field}`, 'Warenwerte dürfen höchstens sechs Nachkommastellen enthalten.')
      for (const field of ['lengthCm', 'widthCm', 'heightCm']) if (item[field] !== null && !Number.isInteger(item[field])) add(`${path}${field}`, 'Die Abmessung muss in ganzen Zentimetern vorliegen.')
      if (item.weightKg === null) add(`${path}weightKg`, 'Gewicht fehlt. Bitte prüfen.', 'warning')
      if (item.packaging === '') add(`${path}packaging`, 'Verpackungsart fehlt. Bitte prüfen.', 'warning')
    })
  })
  function inspect(value, path = '') {
    if (typeof value === 'string' && outsideLatin1(value)) add(path, 'Dieses Feld enthält Zeichen außerhalb des vorgeschriebenen ISO-8859-1-Zeichensatzes. Bitte vor dem Export bearbeiten.')
    else if (Array.isArray(value)) value.forEach((entry, index) => inspect(entry, `${path}.${index}`))
    else if (object(value)) Object.entries(value).forEach(([key, entry]) => { if (key !== 'id') inspect(entry, path ? `${path}.${key}` : key) })
  }
  inspect(order)
  return issues
}

const xmlValue = value => String(value).replace(/'/g, '´').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tag = (name, value) => value === '' || value === null || value === undefined ? '' : `    <${name}>${xmlValue(value)}</${name}>\n`
const germanDate = value => value.split('-').reverse().join('.')
const xmlNumber = value => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))

function goodsXml(goods) {
  const totalMeters = goods.reduce((sum, item) => sum + (item.loadingMeters ?? 0), 0)
  return goods.map((item, index) => '    <Ware>\n'
    + (index === 0 && goods.some(entry => entry.loadingMeters !== null) ? tag('Lademeter', xmlNumber(totalMeters)) : '')
    + tag('Menge', item.quantity === null ? null : xmlNumber(item.quantity))
    + tag('Verpackung', item.packaging) + tag('Bezeichnung', item.description)
    + tag('Bruttogewicht', item.weightKg === null ? null : xmlNumber(item.weightKg))
    + tag('LaengeWare_cm', item.lengthCm) + tag('BreiteWare_cm', item.widthCm) + tag('HoeheWare_cm', item.heightCm)
    + tag('Volumen_m3', item.volumeM3 === null ? null : xmlNumber(item.volumeM3)) + '    </Ware>\n').join('')
}

function stopXml(stop) {
  const name = stop.type === 'loading' ? 'Ladestelle' : 'Entladestelle'
  const date = germanDate(stop.date)
  return `    <${name}>\n` + tag('Firma', stop.company) + tag('Strasse', stop.street) + tag('Land', stop.country)
    + tag('PLZ', stop.postalCode) + tag('Ort', stop.city)
    + tag('Termin', `${date}${stop.timeFrom ? ` ${stop.timeFrom}${stop.timeUntil ? ` - ${stop.timeUntil}` : ''}` : stop.timeUntil ? ` bis ${stop.timeUntil}` : ''}`)
    + (stop.timeFrom ? tag('Ankunft_Plan', `${date} ${stop.timeFrom}`) : '')
    + (stop.timeUntil ? tag('Slotzeit_Plan', `${date} ${stop.timeUntil}`) : '')
    + tag('Fixtermin', stop.fixed ? 1 : 0)
    + tag(stop.type === 'loading' ? 'Abholinformation' : 'Zustellinformation', stop.note)
    + tag('LieferscheinNr', stop.reference) + tag('Ansprechpartner', stop.contactName)
    + tag('MailAdresse', stop.contactEmail) + tag('HandyNr', stop.contactPhone)
    + goodsXml(stop.goods) + `    </${name}>\n`
}

export function buildMailboxOrderXml(input, { customerId, originalPdf, exportId, allowMissingPrice = false, companyCurrency } = {}) {
  const order = normalizeMailboxOrder(input)
  const issues = validateMailboxOrder(order, { allowMissingPrice, companyCurrency })
  if (order.price !== null && !/^[A-Z]{3}$/.test(companyCurrency || '')) issues.push({ path: 'currency', message: 'Die DyCoS-Firmenwährung muss vor dem XML-Export bestätigt sein.', severity: 'error' })
  const errors = issues.filter(issue => issue.severity === 'error')
  if (errors.length) throw new Error(errors.map(issue => issue.message).join(' '))
  if (typeof customerId !== 'string' || !/^[1-9]\d{0,9}$/.test(customerId) || Number(customerId) > 2147483647) throw new Error('Die verifizierte interne DyCoS-Adress-ID fehlt.')
  if (typeof exportId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(exportId)) throw new Error('Eine stabile Exportreferenz ist erforderlich.')
  const name = text(originalPdf?.name, 255, 'originalPdf.name')
  const content = originalPdf?.contentBytes
  if (!name || !/\.pdf$/i.test(name) || /[/\\]/.test(name) || /[^\u0020-\u007e\u00a0-\u00ff]/.test(name) || typeof content !== 'string' || content.length > 7_000_000 || !/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(content) || content.length % 4 !== 0) throw new Error('Ein unverändertes gültiges Original-PDF ist erforderlich.')
  const firstLoading = order.stops.find(stop => stop.type === 'loading')
  const lastUnloading = order.stops.filter(stop => stop.type === 'unloading').at(-1)
  return '<?xml version="1.0" encoding="iso-8859-1"?>\n<Datenteil>\n  <Auftrag>\n'
    + tag('Quelle', 'KI') + tag('LadeDatum', germanDate(order.loadingDate)) + tag('EntladeDatum', germanDate(order.unloadingDate))
    + tag('Ladezeit', firstLoading.timeFrom) + tag('Entladezeit', lastUnloading.timeFrom)
    + tag('Fahrzeugart', order.vehicleType) + tag('Referenznummer', order.customerReference)
    + tag('Vorschriften', order.instructions) + tag('DateiData', content) + tag('Dateityp', 'pdf') + tag('DateinameOriginal', name)
    + tag('FrachtzahlerID', customerId) + (order.price === null ? '' : tag('Frachtbetrag', order.price.toFixed(2)))
    + tag('DispoBemerkung', order.dispatchNote) + tag('Ansprechpartner', order.contactName)
    + order.stops.map(stopXml).join('') + '  </Auftrag>\n</Datenteil>\n'
}
