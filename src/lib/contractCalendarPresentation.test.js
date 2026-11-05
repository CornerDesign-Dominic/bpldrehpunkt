import assert from 'node:assert/strict'
import test from 'node:test'
import { contractCalendarDeepLink, contractCalendarEntries, contractCalendarReturnSource, contractCalendarVisibleIds } from './contractCalendarPresentation.js'
import { canViewSystemCalendars } from './permissions.js'
import { createReturnState, resolveReturnNavigation } from './recordNavigation.js'

test('contract-only read access opens the calendar without granting other modules', () => {
  assert.equal(canViewSystemCalendars({ role: 'user', permissions: { contracts: 'view' } }), true)
  assert.equal(canViewSystemCalendars({ role: 'admin', permissions: {} }), false)
})

test('contract calendar targets the exact source deadline and excludes completed or foreign records', () => {
  const sources = {
    cases: { contracts: [{ id: 'Telekom/50%', partnerName: 'Telekom', contractNumber: 'V-5' }] },
    deadlines: [
      { id: 'Frist %', parentPath: 'contracts/Telekom/50%', title: 'Kündigung', date: '2026-12-31', time: '14:30', note: 'Vertrag prüfen' },
      { id: 'completed', parentPath: 'contracts/Telekom/50%', date: '2026-12-31', completed: true },
      { id: 'invalid', parentPath: 'contracts/Telekom/50%', date: '2026-02-30' },
      { id: 'private', parentPath: 'contracts/other', date: '2026-12-31' },
      { id: 'damage', parentPath: 'damageCases/Telekom/50%', date: '2026-12-31' },
    ],
  }
  const [event, ...other] = contractCalendarEntries(sources)
  assert.deepEqual(other, [])
  assert.equal(event.id, 'contract:Telekom/50%:deadline:Frist %')
  assert.equal(event.title, 'Telekom · Kündigung')
  assert.equal(event.time, '14:30')
  assert.equal(event.description, 'Vertrag prüfen')
  const target = new URL(event.targetPath, 'https://example.invalid')
  assert.equal(decodeURIComponent(target.pathname.split('/').at(-1)), 'Telekom/50%')
  assert.equal(new URLSearchParams(target.hash.slice(1)).get('termin'), 'Frist %')
})

test('contract calendar deep links validate dates and never reinterpret other calendar links', () => {
  const query = new URLSearchParams({ date: '2032-02-29', calendar: 'system-contracts', event: 'contract:C:deadline:D %' })
  assert.deepEqual(contractCalendarDeepLink(`?${query}`), { date: '2032-02-29', year: 2032, month: 1, calendarId: 'system-contracts', eventId: 'contract:C:deadline:D %' })
  for (const search of ['', '?date=2031-02-29&calendar=system-contracts', '?date=2032-99-01&calendar=system-contracts', '?date=2032-02-29&calendar=system-damages', '?date=0032-02-29&calendar=system-contracts']) assert.equal(contractCalendarDeepLink(search), null)
  assert.equal(contractCalendarDeepLink('?date=2032-02-29&calendar=system-contracts&event=private-event').eventId, '')
})

test('an authorized linked contract calendar becomes visible even if it was deliberately hidden', () => {
  const deepLink = contractCalendarDeepLink('?date=2032-02-29&calendar=system-contracts')
  const available = [{ id: 'system-contracts' }, { id: 'personal-user' }]
  assert.deepEqual(contractCalendarVisibleIds(available, null, '[]', deepLink), ['system-contracts'])
  assert.deepEqual(contractCalendarVisibleIds(available, ['personal-user'], null, deepLink), ['personal-user', 'system-contracts'])
  assert.deepEqual(contractCalendarVisibleIds([{ id: 'personal-user' }], null, '[]', deepLink), [])
  assert.deepEqual(contractCalendarVisibleIds([{ id: 'personal-user' }], ['system-contracts'], null, deepLink), ['personal-user'])
})

test('return from a contract restores the displayed calendar month and the contract source', () => {
  const contractOrigin = { returnTo: '/vertragsmanagement/vertraege/C', returnState: null }
  const source = contractCalendarReturnSource({ pathname: '/kalender', search: '', hash: '', state: contractOrigin }, 2033, 7, 'contract:C:deadline:D')
  const back = resolveReturnNavigation(createReturnState(source), '/vertragsmanagement/vertraege')
  assert.equal(back.to, '/kalender?date=2033-08-01&calendar=system-contracts&event=contract%3AC%3Adeadline%3AD')
  assert.deepEqual(back.state, contractOrigin)
  assert.equal(contractCalendarDeepLink(source.search).month, 7)
  const earlierLink = { pathname: '/kalender', search: '?date=2032-02-29&calendar=system-contracts', hash: '#old', state: null }
  assert.equal(contractCalendarDeepLink(contractCalendarReturnSource(earlierLink, 2032, 1, 'contract:C:deadline:D').search).date, '2032-02-29')
  assert.equal(contractCalendarDeepLink(contractCalendarReturnSource(earlierLink, 2034, 5, 'contract:C:deadline:D').search).date, '2034-06-01')
})
