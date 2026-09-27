/**
 * Explicit whitelist for road-routing preparation. Values are ISO-3166-1
 * Alpha-2 codes for European road-logistics countries plus the relevant
 * Caucasus transition countries (AM, AZ, GE). XK is the operational Kosovo
 * code used by routing providers; it has no officially assigned ISO-3166-1
 * Alpha-2 code, but is intentionally retained for transport imports.
 */
const countryEntries = [
  ['AL', 'Albanien', ['Albania']],
  ['AD', 'Andorra', ['AND']],
  ['AM', 'Armenien', ['Armenia', 'ARM']],
  ['AT', 'Österreich', ['Austria', 'A']],
  ['AZ', 'Aserbaidschan', ['Azerbaijan']],
  ['BY', 'Belarus', ['Weißrussland', 'Weissrussland']],
  ['BE', 'Belgien', ['Belgium', 'B']],
  ['BA', 'Bosnien und Herzegowina', ['Bosnia and Herzegovina', 'Bosnien-Herzegowina', 'BIH']],
  ['BG', 'Bulgarien', ['Bulgaria']],
  ['HR', 'Kroatien', ['Croatia']],
  ['CY', 'Zypern', ['Cyprus']],
  ['CZ', 'Tschechien', ['Czechia', 'Czech Republic']],
  ['DK', 'Dänemark', ['Denmark']],
  ['EE', 'Estland', ['Estonia', 'EST']],
  ['FI', 'Finnland', ['Finland', 'FIN']],
  ['FR', 'Frankreich', ['France', 'F']],
  ['GE', 'Georgien', ['Georgia']],
  ['DE', 'Deutschland', ['Germany', 'D']],
  ['GR', 'Griechenland', ['Greece']],
  ['HU', 'Ungarn', ['Hungary', 'H']],
  ['IS', 'Island', ['Iceland']],
  ['IE', 'Irland', ['Ireland', 'IRL']],
  ['IT', 'Italien', ['Italy', 'I']],
  ['LV', 'Lettland', ['Latvia']],
  ['LI', 'Liechtenstein', ['FL']],
  ['LT', 'Litauen', ['Lithuania']],
  ['LU', 'Luxemburg', ['Luxembourg', 'L']],
  ['MT', 'Malta', []],
  ['MD', 'Moldau', ['Moldova']],
  ['MC', 'Monaco', []],
  ['ME', 'Montenegro', ['MNE']],
  ['NL', 'Niederlande', ['Netherlands', 'Holland']],
  ['MK', 'Nordmazedonien', ['North Macedonia', 'Macedonia']],
  ['NO', 'Norwegen', ['Norway', 'N']],
  // `P` occurs in transport imports for both Polen and Portugal. It is
  // intentionally ambiguous and must be selected by the user at routing time.
  ['PL', 'Polen', ['Poland', 'P']],
  ['PT', 'Portugal', ['P']],
  ['RO', 'Rumänien', ['Romania']],
  ['RU', 'Russland', ['Russia', 'RUS']],
  ['SM', 'San Marino', ['RSM']],
  ['RS', 'Serbien', ['Serbia', 'SRB']],
  ['SK', 'Slowakei', ['Slovakia']],
  ['SI', 'Slowenien', ['Slovenia', 'SLO']],
  // `S` is likewise used for Spanien and Schweden in legacy import values.
  ['ES', 'Spanien', ['Spain', 'E', 'S']],
  ['SE', 'Schweden', ['Sweden', 'S']],
  ['CH', 'Schweiz', ['Switzerland']],
  ['TR', 'Türkei', ['Turkey', 'Türkiye', 'Turkiye']],
  ['UA', 'Ukraine', ['Ukraine']],
  ['GB', 'Vereinigtes Königreich', ['United Kingdom', 'Grossbritannien', 'Großbritannien', 'England', 'UK']],
  ['VA', 'Vatikanstadt', ['Vatican City', 'Vatikan', 'V']],
  ['XK', 'Kosovo', ['Kosova', 'RKS']],
]

const normaliseAlias = (value) => typeof value === 'string'
  ? value.trim().toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  : ''

export const routingCountryWhitelist = Object.freeze(countryEntries.map(([code, name, aliases]) => Object.freeze({ code, name, aliases: Object.freeze([...aliases]) })))

const countriesByAlias = new Map()
for (const { code, name, aliases } of routingCountryWhitelist) {
  const country = Object.freeze({ code, name })
  for (const alias of [code, name, ...aliases]) {
    const key = normaliseAlias(alias)
    const candidates = countriesByAlias.get(key) || []
    if (!candidates.some((candidate) => candidate.code === country.code)) candidates.push(country)
    countriesByAlias.set(key, candidates)
  }
}

for (const [alias, candidates] of countriesByAlias) countriesByAlias.set(alias, Object.freeze(candidates))

/**
 * Returns all countries that match an import value. More than one candidate
 * means the value must be confirmed by a user before it can be routed.
 */
export function routingCountryCandidates(value) {
  return countriesByAlias.get(normaliseAlias(value)) || []
}

export const ambiguousRoutingCountryAliases = Object.freeze([...countriesByAlias.entries()]
  .filter(([, candidates]) => candidates.length > 1)
  .map(([alias, candidates]) => Object.freeze({ alias, candidates })))

/**
 * Resolves a routing country alias to its ISO-3166 Alpha-2 code. This is the
 * only country vocabulary used by routing and geocoding preparation.
 */
export function normaliseRoutingCountry(value) {
  const candidates = routingCountryCandidates(value)
  return candidates.length === 1 ? candidates[0] : null
}

export const routingCountryCodes = Object.freeze(routingCountryWhitelist.map(({ code }) => code))
