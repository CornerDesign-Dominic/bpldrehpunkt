import test from 'node:test'
import assert from 'node:assert/strict'
import { ambiguousRoutingCountryAliases, normaliseRoutingCountry, routingCountryCandidates, routingCountryCodes, routingCountryWhitelist } from './routingCountries.js'

test('routing countries normalise German, English and short aliases to ISO Alpha-2', () => {
  for (const [value, code] of [
    ['D', 'DE'], ['DE', 'DE'], ['Deutschland', 'DE'], ['Germany', 'DE'],
    ['F', 'FR'], ['FR', 'FR'], ['Frankreich', 'FR'], ['France', 'FR'],
    ['PT', 'PT'], ['Portugal', 'PT'],
  ]) assert.equal(normaliseRoutingCountry(value)?.code, code)
})

test('every whitelisted routing country normalises its ISO code and country names', () => {
  for (const { code, name, aliases } of routingCountryWhitelist) {
    assert.equal(normaliseRoutingCountry(code)?.code, code, `${code} ISO code`)
    assert.equal(normaliseRoutingCountry(name)?.code, code, `${code} German name`)
    for (const alias of aliases) {
      const candidates = routingCountryCandidates(alias).map((candidate) => candidate.code)
      assert.ok(candidates.includes(code), `${code} alias ${alias}`)
      if (candidates.length === 1) assert.equal(normaliseRoutingCountry(alias)?.code, code, `${code} alias ${alias}`)
    }
  }
})

test('routing country whitelist contains every European road-routing and transition country', () => {
  const requiredCodes = ['AL', 'AD', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM', 'TR', 'UA', 'VA', 'XK', 'AM', 'AZ', 'GE']
  for (const code of requiredCodes) assert.ok(routingCountryCodes.includes(code), `${code} missing from routing whitelist`)
  assert.equal(normaliseRoutingCountry('Atlantis'), null)
})

test('ambiguous short import aliases require an explicit country choice', () => {
  assert.deepEqual(routingCountryCandidates('P').map(({ code }) => code), ['PL', 'PT'])
  assert.deepEqual(routingCountryCandidates('S').map(({ code }) => code), ['ES', 'SE'])
  assert.equal(normaliseRoutingCountry('P'), null)
  assert.equal(normaliseRoutingCountry('S'), null)
  assert.deepEqual(ambiguousRoutingCountryAliases.map(({ alias }) => alias), ['p', 's'])
})
