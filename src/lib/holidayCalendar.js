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

// Phase 1 deliberately keeps the source local. Every record follows the
// provider-neutral shape that a later API or managed source will return.
export const GERMAN_HOLIDAY_SOURCE = Object.freeze([
  ['2026-01-01', 'Neujahr', 'national'],
  ['2026-01-06', 'Heilige Drei Könige', 'regional', ['BW', 'BY', 'ST']],
  ['2026-04-03', 'Karfreitag', 'national'],
  ['2026-04-06', 'Ostermontag', 'national'],
  ['2026-05-01', 'Tag der Arbeit', 'national'],
  ['2026-05-14', 'Christi Himmelfahrt', 'national'],
  ['2026-05-25', 'Pfingstmontag', 'national'],
  ['2026-06-04', 'Fronleichnam', 'regional', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']],
  ['2026-08-15', 'Mariä Himmelfahrt', 'regional', ['SL']],
  ['2026-09-20', 'Weltkindertag', 'regional', ['TH']],
  ['2026-10-03', 'Tag der Deutschen Einheit', 'national'],
  ['2026-10-31', 'Reformationstag', 'regional', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']],
  ['2026-11-01', 'Allerheiligen', 'regional', ['BW', 'BY', 'NW', 'RP', 'SL']],
  ['2026-11-18', 'Buß- und Bettag', 'regional', ['SN']],
  ['2026-12-25', '1. Weihnachtstag', 'national'],
  ['2026-12-26', '2. Weihnachtstag', 'national'],
  ['2027-01-01', 'Neujahr', 'national'],
  ['2027-01-06', 'Heilige Drei Könige', 'regional', ['BW', 'BY', 'ST']],
  ['2027-03-26', 'Karfreitag', 'national'],
  ['2027-03-29', 'Ostermontag', 'national'],
  ['2027-05-01', 'Tag der Arbeit', 'national'],
  ['2027-05-06', 'Christi Himmelfahrt', 'national'],
  ['2027-05-17', 'Pfingstmontag', 'national'],
  ['2027-05-27', 'Fronleichnam', 'regional', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']],
  ['2027-08-15', 'Mariä Himmelfahrt', 'regional', ['SL']],
  ['2027-09-20', 'Weltkindertag', 'regional', ['TH']],
  ['2027-10-03', 'Tag der Deutschen Einheit', 'national'],
  ['2027-10-31', 'Reformationstag', 'regional', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']],
  ['2027-11-01', 'Allerheiligen', 'regional', ['BW', 'BY', 'NW', 'RP', 'SL']],
  ['2027-11-17', 'Buß- und Bettag', 'regional', ['SN']],
  ['2027-12-25', '1. Weihnachtstag', 'national'],
  ['2027-12-26', '2. Weihnachtstag', 'national'],
].map(([date, name, scope, stateCodes = []]) => Object.freeze({
  countryCode: 'DE',
  year: Number(date.slice(0, 4)),
  date,
  name,
  scope,
  stateCodes,
})))

export const HOLIDAY_YEARS = Object.freeze([...new Set(GERMAN_HOLIDAY_SOURCE.map((holiday) => holiday.year))])

const europeanCountryNames = [
  ['AL', 'Albanien'], ['AD', 'Andorra'], ['AM', 'Armenien'], ['AT', 'Österreich'], ['AZ', 'Aserbaidschan'], ['BE', 'Belgien'], ['BA', 'Bosnien und Herzegowina'], ['BG', 'Bulgarien'], ['DK', 'Dänemark'], ['DE', 'Deutschland'], ['EE', 'Estland'], ['FI', 'Finnland'], ['FR', 'Frankreich'], ['GE', 'Georgien'], ['GR', 'Griechenland'], ['IE', 'Irland'], ['IS', 'Island'], ['IT', 'Italien'], ['XK', 'Kosovo'], ['HR', 'Kroatien'], ['LV', 'Lettland'], ['LI', 'Liechtenstein'], ['LT', 'Litauen'], ['LU', 'Luxemburg'], ['MT', 'Malta'], ['MD', 'Moldau'], ['MC', 'Monaco'], ['ME', 'Montenegro'], ['NL', 'Niederlande'], ['MK', 'Nordmazedonien'], ['NO', 'Norwegen'], ['PL', 'Polen'], ['PT', 'Portugal'], ['RO', 'Rumänien'], ['RU', 'Russland'], ['SM', 'San Marino'], ['SE', 'Schweden'], ['CH', 'Schweiz'], ['RS', 'Serbien'], ['SK', 'Slowakei'], ['SI', 'Slowenien'], ['ES', 'Spanien'], ['CZ', 'Tschechien'], ['TR', 'Türkei'], ['UA', 'Ukraine'], ['HU', 'Ungarn'], ['VA', 'Vatikanstadt'], ['GB', 'Vereinigtes Königreich'], ['BY', 'Weißrussland'], ['CY', 'Zypern'],
]

export const EUROPEAN_COUNTRIES = Object.freeze(europeanCountryNames
  .map(([code, name]) => Object.freeze({ code, name, available: code === 'DE', regions: code === 'DE' ? GERMAN_STATES : [] }))
  .sort((left, right) => left.name.localeCompare(right.name, 'de')))

export function getHolidayStateNames(stateCodes) {
  return stateCodes.map((code) => stateNames[code]).filter(Boolean)
}

export function getVisibleHolidays(year, germanyEnabled, selectedStateCodes) {
  if (!germanyEnabled) return []
  const selectedStates = new Set(selectedStateCodes)
  return GERMAN_HOLIDAY_SOURCE.filter((holiday) => holiday.year === year
    && (holiday.scope === 'national' || holiday.stateCodes.some((stateCode) => selectedStates.has(stateCode))))
}
