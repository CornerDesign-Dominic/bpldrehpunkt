export const GERMAN_STATES = Object.freeze([
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' },
])

const stateNames = Object.fromEntries(GERMAN_STATES.map((state) => [state.code, state.name]))
// Existing historic records are deliberately not rewritten by the importer.
// This keeps those records readable with the same German labels until they
// have a server-provided displayName of their own.
const LEGACY_GERMAN_HOLIDAY_NAMES = Object.freeze({
  "New Year's Day": 'Neujahr',
  Epiphany: 'Heilige Drei Könige',
  'Good Friday': 'Karfreitag',
  'Easter Sunday': 'Ostersonntag',
  'Easter Monday': 'Ostermontag',
  'Labour Day': 'Tag der Arbeit',
  'Ascension Day': 'Christi Himmelfahrt',
  Pentecost: 'Pfingstsonntag',
  'Whit Monday': 'Pfingstmontag',
  'Corpus Christi': 'Fronleichnam',
  'Assumption Day': 'Mariä Himmelfahrt',
  'German Unity Day': 'Tag der Deutschen Einheit',
  'Reformation Day': 'Reformationstag',
  "All Saints' Day": 'Allerheiligen',
  'Day of Repentance and Prayer': 'Buß- und Bettag',
  'Repentance and Prayer Day': 'Buß- und Bettag',
  "International Women's Day": 'Internationaler Frauentag',
  "World Children's Day": 'Weltkindertag',
  'Christmas Day': '1. Weihnachtstag',
  'Second Day of Christmas': '2. Weihnachtstag',
  "St. Stephen's Day": '2. Weihnachtstag',
  '75th anniversary of the uprising of June 17, 1953': '75. Jahrestag des Volksaufstands vom 17. Juni 1953',
})

export function holidayYears(referenceDate = new Date()) {
  return Array.from({ length: 5 }, (_, index) => referenceDate.getFullYear() + index)
}

const europeanCountryNames = [
  ['AL', 'Albanien'], ['AD', 'Andorra'], ['AM', 'Armenien'], ['AT', 'Österreich'], ['AZ', 'Aserbaidschan'], ['BE', 'Belgien'], ['BA', 'Bosnien und Herzegowina'], ['BG', 'Bulgarien'], ['DK', 'Dänemark'], ['DE', 'Deutschland'], ['EE', 'Estland'], ['FI', 'Finnland'], ['FR', 'Frankreich'], ['GE', 'Georgien'], ['GR', 'Griechenland'], ['IE', 'Irland'], ['IS', 'Island'], ['IT', 'Italien'], ['XK', 'Kosovo'], ['HR', 'Kroatien'], ['LV', 'Lettland'], ['LI', 'Liechtenstein'], ['LT', 'Litauen'], ['LU', 'Luxemburg'], ['MT', 'Malta'], ['MD', 'Moldau'], ['MC', 'Monaco'], ['ME', 'Montenegro'], ['NL', 'Niederlande'], ['MK', 'Nordmazedonien'], ['NO', 'Norwegen'], ['PL', 'Polen'], ['PT', 'Portugal'], ['RO', 'Rumänien'], ['RU', 'Russland'], ['SM', 'San Marino'], ['SE', 'Schweden'], ['CH', 'Schweiz'], ['RS', 'Serbien'], ['SK', 'Slowakei'], ['SI', 'Slowenien'], ['ES', 'Spanien'], ['CZ', 'Tschechien'], ['TR', 'Türkei'], ['UA', 'Ukraine'], ['HU', 'Ungarn'], ['VA', 'Vatikanstadt'], ['GB', 'Vereinigtes Königreich'], ['BY', 'Weißrussland'], ['CY', 'Zypern'],
]

const countriesByCode = Object.fromEntries(europeanCountryNames.map(([code, name]) => [code, Object.freeze({ code, name, available: code === 'DE', regions: code === 'DE' ? GERMAN_STATES : [] })]))

export const EUROPEAN_COUNTRIES = Object.freeze([
  countriesByCode.DE,
  ...Object.values(countriesByCode).filter((country) => country.code !== 'DE').sort((left, right) => left.name.localeCompare(right.name, 'de')),
])

export function getHolidayStateNames(stateCodes) {
  return stateCodes.map((code) => stateNames[code]).filter(Boolean)
}

function colorVariant(holiday) {
  if (holiday.countryCode === 'DE' && holiday.nationalHoliday === true) return 'germany-national'
  return holiday.nationalHoliday === true ? 'foreign-national' : 'regional'
}

function colorPriority(value) {
  return ({ regional: 1, 'foreign-national': 2, 'germany-national': 3 })[value] || 0
}

function holidayDisplayName(holiday, sourceName) {
  if (holiday.displayName) return holiday.displayName
  if (holiday.countryCode === 'DE') return LEGACY_GERMAN_HOLIDAY_NAMES[sourceName] || sourceName
  return sourceName
}

export function getVisibleHolidays(records, year, germanyEnabled, selectedStateCodes, selectedCountryCodes = ['DE']) {
  if (!Array.isArray(records)) return []
  const selectedStates = new Set(selectedStateCodes)
  const selectedCountries = new Set(selectedCountryCodes)
  const visibleRecords = records.filter((holiday) => {
    if (holiday.year !== year || !selectedCountries.has(holiday.countryCode)) return false
    if (holiday.countryCode === 'DE' && !germanyEnabled) return false
    if (holiday.countryCode !== 'DE') return holiday.nationalHoliday === true || (Array.isArray(holiday.subdivisionCodes) && holiday.subdivisionCodes.length > 0)
    return holiday.nationalHoliday === true || (Array.isArray(holiday.subdivisionCodes) && holiday.subdivisionCodes.some((stateCode) => selectedStates.has(stateCode)))
  })

  // A shared holiday is one calendar item, even when future country sources
  // contribute multiple records for the same date and holiday key.
  return [...visibleRecords.reduce((items, holiday) => {
    const sourceName = holiday.sourceName || holiday.name || ''
    const displayName = holidayDisplayName(holiday, sourceName)
    const id = `${holiday.date}-${sourceName}`
    const nextColor = colorVariant(holiday)
    const current = items.get(id) || { id, date: holiday.date, name: displayName, colorVariant: nextColor, countries: [] }
    const country = current.countries.find((item) => item.countryCode === holiday.countryCode)
    const subdivisionCodes = Array.isArray(holiday.subdivisionCodes) ? holiday.subdivisionCodes : []
    if (country) country.stateCodes = [...new Set([...country.stateCodes, ...subdivisionCodes])]
    else current.countries.push({ countryCode: holiday.countryCode, name: countriesByCode[holiday.countryCode]?.name || holiday.countryCode, stateCodes: [...subdivisionCodes] })
    if (colorPriority(nextColor) > colorPriority(current.colorVariant)) current.colorVariant = nextColor
    items.set(id, current)
    return items
  }, new Map()).values()].sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name, 'de'))
}
