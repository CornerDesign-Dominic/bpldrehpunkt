import assert from 'node:assert/strict'
import test from 'node:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { LanguageContext } from '../../i18n/languageContext.js'
import ManagedMailboxRecommendationsPanel, { MailboxRecommendationControl } from './MailboxRecommendationSettings.jsx'

async function mount(component, handler, language = 'de') {
  globalThis.__mailboxModesCall = handler
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<MemoryRouter><LanguageContext.Provider value={{ language }}>{component}</LanguageContext.Provider></MemoryRouter>))
  return { container, close: async () => { await act(async () => root.unmount()); container.remove() } }
}
const radios = container => [...container.querySelectorAll('input[type=radio]')]

test('personal modes are mutually exclusive and send mode; legacy enabled stays recommendations', async () => {
  const calls = []
  let state = { enabled: true, managed: false, state: 'active' }
  const mounted = await mount(<MailboxRecommendationControl connection={{ id: 'personal' }} editable />, async (name, data) => {
    calls.push({ name, data })
    if (name === 'setMailboxRecommendationSettings') state = { ...state, mode: data.mode, enabled: data.mode !== 'off' }
    return state
  })
  assert.deepEqual(radios(mounted.container).map(input => input.checked), [false, true, false])
  await act(async () => radios(mounted.container)[2].click())
  assert.deepEqual(calls.find(call => call.name === 'setMailboxRecommendationSettings').data, { connectionId: 'personal', mode: 'automatic' })
  assert.deepEqual(radios(mounted.container).map(input => input.checked), [false, false, true])
  assert.match(mounted.container.textContent, /Auftrag und Mahnung bleiben manuell/)
  await mounted.close()
})

test('managed profile is centrally controlled and cannot alter its mode', async () => {
  const mounted = await mount(<MailboxRecommendationControl connection={{ id: 'shared' }} editable />, async () => ({ managed: true, enabled: true, mode: 'automatic', state: 'active' }))
  assert.equal(radios(mounted.container).length, 0)
  assert.match(mounted.container.textContent, /Zentral im Adminbereich verwaltet/)
  assert.match(mounted.container.textContent, /Postfach auslesen und bearbeiten/)
  await mounted.close()
})

test('admin modes are per mailbox and disconnected scopes can only be switched off', async () => {
  const calls = []
  const mounted = await mount(<ManagedMailboxRecommendationsPanel />, async (name, data) => {
    calls.push({ name, data })
    if (name === 'listManagedMailboxRecommendations') return { mailboxes: [
      { email: 'one@example.test', connectionId: 'one', enabled: true, mode: 'recommend', state: 'active' },
      { email: 'two@example.test', scopeId: 'scope-two', available: false, enabled: true, mode: 'automatic', state: 'error' },
    ] }
    return { enabled: data.mode !== 'off', mode: data.mode, state: 'idle' }
  })
  const controls = radios(mounted.container)
  assert.equal(controls.length, 6)
  assert.notEqual(controls[0].name, controls[3].name)
  assert.equal(controls[3].disabled, false)
  assert.equal(controls[4].disabled, true)
  assert.equal(controls[5].disabled, true)
  await act(async () => controls[3].click())
  assert.deepEqual(calls.find(call => call.name === 'setMailboxRecommendationSettings').data, { managedScopeId: 'scope-two', mode: 'off' })
  assert.deepEqual(radios(mounted.container).slice(3).map(input => input.checked), [true, false, false])
  await mounted.close()
})

test('failed update preserves selected mode and displays an error', async () => {
  const mounted = await mount(<MailboxRecommendationControl connection={{ id: 'personal' }} editable />, async name => {
    if (name === 'setMailboxRecommendationSettings') throw new Error('network')
    return { enabled: false, managed: false, mode: 'off', state: 'idle' }
  }, 'en')
  await act(async () => radios(mounted.container)[2].click())
  assert.deepEqual(radios(mounted.container).map(input => input.checked), [true, false, false])
  assert.match(mounted.container.querySelector('[role=alert]').textContent, /Could not save setting/)
  await mounted.close()
})
