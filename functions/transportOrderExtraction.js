const COUNTRY_NAMES = { D: 'Deutschland', DE: 'Deutschland', AT: 'Österreich', FR: 'Frankreich', RO: 'Rumänien' }
const DELIVERY_NOTE_REFERENCE = /\b(?:lt\.?\s*(?:ls\.?|liefers(?:chein|chien))|laut\s+liefers(?:chein|chien)|siehe(?:\s+(?:den|dem))?\s+(?:ls\.?|liefers(?:chein|chien)))\b/i
const DATE_IN_ADDRESS = /\b\d{1,2}\.\d{1,2}\.\d{4}\b/g

function emptyAddress() { return { company: '', street: '', postalCode: '', city: '', country: '' } }

function cleanLine(value) { return String(value || '').replace(/\s+/g, ' ').replace(/^[|·•\-–—\s]+|[|·•\-–—\s]+$/g, '').trim() }

export function sanitizeTransportAddress(address) {
  return Object.fromEntries(['company', 'street', 'postalCode', 'city', 'country'].map((field) => [field, cleanLine(address?.[field]).replace(DATE_IN_ADDRESS, '').replace(/\s+/g, ' ').trim()]))
}

function countryName(value) {
  const normalized = cleanLine(value).replace(/[.,;]+$/g, '')
  return COUNTRY_NAMES[normalized.toUpperCase()] || normalized
}

function isPlausibleOrderNumber(value) {
  const match = value?.match(/^(\d{2})(\d{2})\d{5}$/)
  return Boolean(match) && Number(match[2]) >= 1 && Number(match[2]) <= 12
}

function parseDate(value) {
  const match = value?.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/)
  if (!match) return ''
  const [day, month, year] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parsePostalLine(value) {
  const line = cleanLine(value)
  const countryFirst = line.match(/^(D|DE|AT|FR|RO)(?:\s*-\s*|\s+)(\d{4,6})\s+(.+)$/i)
  if (countryFirst) return { country: countryName(countryFirst[1]), postalCode: countryFirst[2], city: cleanLine(countryFirst[3]) }
  const postalFirst = line.match(/^(\d{4,6})\s+(.+?)(?:\s*,\s*(.+))?$/)
  if (postalFirst) return { postalCode: postalFirst[1], city: cleanLine(postalFirst[2]), country: postalFirst[3] ? countryName(postalFirst[3]) : '' }
  return null
}

function isStreet(value) { return /\b(?:str\.?|straße|strasse|weg|allee|platz|gasse|ring|ufer|chaussee|route)\b/i.test(value) || /\d+[a-zA-Z]?\s*$/.test(value) }

function parseAddress(lines) {
  const values = lines.map(cleanLine).filter(Boolean)
  const result = emptyAddress()
  const locationIndex = values.findIndex((line) => parsePostalLine(line))
  if (locationIndex !== -1) {
    const location = parsePostalLine(values[locationIndex])
    const preceding = values.slice(0, locationIndex)
    result.company = preceding[0] || ''
    result.street = preceding.findLast(isStreet) || ''
    result.postalCode = location.postalCode
    result.city = location.city
    result.country = location.country
    return sanitizeTransportAddress(result)
  }
  const parts = values.flatMap((line) => line.split(',').map(cleanLine).filter(Boolean))
  const commaLocationIndex = parts.findIndex((part) => parsePostalLine(part))
  if (commaLocationIndex !== -1) {
    const location = parsePostalLine(parts[commaLocationIndex])
    result.company = parts[0] || ''
    result.street = parts.slice(1, commaLocationIndex).find(isStreet) || ''
    result.postalCode = location.postalCode
    result.city = location.city
    result.country = location.country
  }
  return sanitizeTransportAddress(result)
}

export function isDeliveryNoteReference(lines) {
  return DELIVERY_NOTE_REFERENCE.test((Array.isArray(lines) ? lines : [lines]).map(cleanLine).join(' '))
}

function valueAfterLabel(line, label) { return cleanLine(line.slice(line.search(label)).replace(label, '')) }

function extractOrderNumber(lines) {
  for (const match of lines.join(' ').matchAll(/Transportauftrag\s*[:#-]?\s*(\d{9})\b/gi)) {
    if (isPlausibleOrderNumber(match[1])) return match[1]
  }
  return ''
}

function carrierBlock(lines, leftColumnLines = lines) {
  const index = lines.findIndex((line) => /Transportauftrag\s*[:#-]?\s*\d{9}\b/i.test(line))
  if (index === -1) return []
  // In our layout the carrier company is one row above the right-aligned
  // order number; the contact shares the order-number row on the left.
  const block = [leftColumnLines[index - 1], leftColumnLines[index]].map(cleanLine).filter(Boolean)
  for (let currentIndex = index + 1; currentIndex < lines.length; currentIndex += 1) {
    const line = lines[currentIndex]
    if (/\b(?:telefon|tel\.?|e-?mail|wie vereinbart|lkw-art|kennzeichen|\d+\.\s*ladestelle)\b/i.test(line)) break
    if (leftColumnLines[currentIndex]) block.push(leftColumnLines[currentIndex])
  }
  return block
}

function stationBlocks(lines, type) {
  const label = type === 'loading' ? /\b\d+\.\s*Ladestelle(?:\(n\))?\s*:?/i : /\b\d+\.\s*Entladestelle\s*:?/i
  const end = /\b(?:\d+\.\s*(?:lade|entlade)stelle|frachtpreis|lkw-art|kennzeichen)\b/i
  const starts = lines.map((line, index) => (label.test(line) ? index : -1)).filter((index) => index !== -1)
  return starts.map((start) => {
    const block = []
    const initial = valueAfterLabel(lines[start], label)
    if (initial) block.push(initial)
    for (let currentIndex = start + 1; currentIndex < lines.length; currentIndex += 1) {
      if (end.test(lines[currentIndex])) break
      block.push(lines[currentIndex])
    }
    return block
  })
}

function addressAndDate(lines) {
  const date = parseDate(lines.find((line) => /\bTermin\b/i.test(line)) || '')
  if (isDeliveryNoteReference(lines)) return { ...emptyAddress(), date }
  return { ...parseAddress(lines.filter((line) => !/\bTermin\b/i.test(line))), date }
}

export function extractTransportOrderFromLines(lines, { carrierLines: leftColumnLines = lines } = {}) {
  const carrierLines = carrierBlock(lines, leftColumnLines)
  const loadingBlocks = stationBlocks(lines, 'loading')
  const unloadingBlocks = stationBlocks(lines, 'unloading')
  const loadingLines = loadingBlocks[0] || []
  const unloadingLines = unloadingBlocks.at(-1) || []
  return {
    data: {
      orderNumber: extractOrderNumber(lines),
      carrier: parseAddress(carrierLines),
      loadingPlace: addressAndDate(loadingLines),
      unloadingPlace: addressAndDate(unloadingLines),
    },
    rawAddressBlocks: { carrier: carrierLines, loadingPlace: loadingLines, unloadingPlace: unloadingLines },
  }
}

export async function extractTransportOrderFromPdf(pdfBytes) {
  // pdfjs is comparatively expensive to initialize. Loading it only for an
  // actual analysis keeps Firebase's deployment-time function discovery fast.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = getDocument({ data: pdfBytes, disableWorker: true, verbosity: 0 })
  try {
    const pdf = await loadingTask.promise
    const lines = []
    const carrierLines = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const orderNumberItem = textContent.items.find((item) => /Transportauftrag\s*[:#-]?\s*\d{9}\b/i.test(item.str || ''))
      const rightColumnStart = orderNumberItem ? orderNumberItem.transform[4] : Number.POSITIVE_INFINITY
      const rows = []
      for (const item of textContent.items.filter((item) => item.str?.trim())) {
        let row = rows.find((candidate) => Math.abs(candidate.y - item.transform[5]) < 2)
        if (!row) {
          row = { y: item.transform[5], items: [] }
          rows.push(row)
        }
        row.items.push({ text: item.str, x: item.transform[4] })
      }
      rows.sort((left, right) => right.y - left.y).forEach((row) => {
        const items = row.items.sort((left, right) => left.x - right.x)
        lines.push(cleanLine(items.map((item) => item.text).join(' ')))
        carrierLines.push(cleanLine(items.filter((item) => item.x < rightColumnStart).map((item) => item.text).join(' ')))
      })
    }
    const extraction = extractTransportOrderFromLines(lines, { carrierLines })
    return { ...extraction, pageCount: pdf.numPages }
  } finally {
    loadingTask.destroy()
  }
}
