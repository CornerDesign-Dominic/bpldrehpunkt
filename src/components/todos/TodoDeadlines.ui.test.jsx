import assert from 'node:assert/strict'
import test from 'node:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import TodoDeadlinesCard, { DeadlineModal } from './TodoDeadlinesCard.jsx'
import { LanguageContext } from '../../i18n/languageContext.js'

const users = [{ id: 'alpha', firstName: 'Alpha', lastName: 'Test', department: 'Ops', todoAccessLevel: 'edit' }, { id: 'beta', firstName: 'Beta', lastName: 'Test', department: 'Ops', todoAccessLevel: 'view' }, { id: 'other', firstName: 'Other', lastName: 'Team', department: 'Sales', todoAccessLevel: 'edit' }]
const todo = { id: 'task', creatorUserId: 'alpha', audienceType: 'department', audienceId: 'Ops' }
const existing = { id: 'date', type: 'deadline', date: '2099-12-01', time: '09:30', reminderEnabled: true, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['alpha'], note: 'Draft context' }
const language = { language: 'de', t: value => value }
async function mount(component) {
  globalThis.__todoUiTest = { actor: { user: { uid: 'alpha' } } }
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const render = async element => act(async () => root.render(<LanguageContext.Provider value={language}>{element}</LanguageContext.Provider>))
  await render(component)
  return { render, cleanup: async () => { await act(async () => root.unmount()); container.remove() } }
}
const field = label => {
  const item = [...document.querySelectorAll('label')].find(entry => entry.querySelector('span')?.textContent.trim() === label)
  assert.ok(item, `Missing field ${label}`)
  return item.querySelector('input,select,textarea')
}
async function enter(element, value) {
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })) })
}
const submit = async () => act(async () => document.querySelector('form.todo-quick-editor').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
const click = async element => act(async () => element.click())
const button = (value, within = document) => [...within.querySelectorAll('button')].find(entry => entry.textContent.trim() === value)

test('deadline reminder validation blocks empty time then saves the same draft after correction', async () => {
  const saves = []; let closed = 0
  const ui = await mount(<DeadlineModal deadline={{ ...existing, time: '' }} todo={todo} users={users} onClose={() => { closed++ }} onSave={async (_entry, values) => saves.push(values)} />)
  try {
    await submit()
    assert.equal(saves.length, 0)
    assert.equal(closed, 0)
    await enter(field('Uhrzeit *'), '10:15')
    await submit()
    assert.equal(saves[0].time, '10:15')
    assert.equal(saves[0].note, 'Draft context')
    assert.deepEqual(saves[0].reminderRecipientUserIds, ['alpha'])
    assert.equal(closed, 1)
  } finally { await ui.cleanup() }
})

test('turning reminder off retains selected recipients, note and source date', async () => {
  const saves = []
  const ui = await mount(<DeadlineModal deadline={existing} todo={todo} users={users} onClose={() => {}} onSave={async (_entry, values) => saves.push(values)} />)
  try {
    await enter(field('Erinnerung'), 'off')
    await submit()
    assert.equal(saves[0].reminderEnabled, false)
    assert.equal(saves[0].date, existing.date)
    assert.deepEqual(saves[0].reminderRecipientUserIds, ['alpha'])
    assert.equal(saves[0].note, existing.note)
  } finally { await ui.cleanup() }
})

test('save failure leaves the draft open for a successful retry', async () => {
  let calls = 0; let closed = 0
  const saves = []
  const ui = await mount(<DeadlineModal deadline={existing} todo={todo} users={users} onClose={() => { closed++ }} onSave={async (_entry, values) => { saves.push(values); if (++calls === 1) throw new Error('Zwischenzeitlich geändert. Bitte neu laden.') }} />)
  try {
    await enter(field('Hinweis'), 'Unsaved personal draft')
    await submit()
    assert.equal(closed, 0)
    assert.match(document.body.textContent, /Zwischenzeitlich geändert/)
    assert.equal(field('Hinweis').value, 'Unsaved personal draft')
    await submit()
    assert.equal(calls, 2)
    assert.deepEqual(saves[0], saves[1])
    assert.equal(closed, 1)
  } finally { await ui.cleanup() }
})

test('readonly deadline list shows notes but has no add or edit controls', async () => {
  const ui = await mount(<TodoDeadlinesCard todo={todo} users={users} todoId="task" canEdit={false} deadlines={[existing]} loading={false} />)
  try {
    assert.match(document.body.textContent, /Draft context/)
    assert.equal(button('Termin / Frist hinzufügen'), undefined)
    assert.equal(document.querySelector('[role="button"]'), null)
    assert.equal(document.querySelector('[role="dialog"]'), null)
  } finally { await ui.cleanup() }
})

test('deadline edits keep their source snapshot when a newer list version arrives', async () => {
  let original
  const props = { todo, users, todoId: 'task', canEdit: true, loading: false, onSave: async (entry) => { original = entry; throw new Error('Aktualisierungskonflikt') } }
  const ui = await mount(<TodoDeadlinesCard {...props} deadlines={[existing]} />)
  try {
    await click(document.querySelector('[role="button"]'))
    await enter(field('Hinweis'), 'My draft')
    await ui.render(<TodoDeadlinesCard {...props} deadlines={[{ ...existing, note: 'Other user saved' }]} />)
    assert.equal(field('Hinweis').value, 'My draft')
    await submit()
    assert.equal(original, existing)
    assert.match(document.body.textContent, /Aktualisierungskonflikt/)
    assert.equal(field('Hinweis').value, 'My draft')
  } finally { await ui.cleanup() }
})

test('a pending deadline save rejects double submission and disables all draft controls', async () => {
  let release; let calls = 0
  const pending = new Promise(resolve => { release = resolve })
  const ui = await mount(<DeadlineModal deadline={existing} todo={todo} users={users} onClose={() => {}} onSave={async () => { calls++; await pending }} />)
  try {
    await act(async () => {
      const form = document.querySelector('form.todo-quick-editor')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    assert.equal(calls, 1)
    assert.equal(field('Hinweis').matches(':disabled'), true)
    assert.equal(field('Art *').matches(':disabled'), true)
  } finally { await act(async () => release()); await ui.cleanup() }
})

test('losing editing access removes the open deadline draft and it does not reappear when access returns', async () => {
  const props = { todo, users, todoId: 'task', deadlines: [existing], loading: false }
  const ui = await mount(<TodoDeadlinesCard {...props} canEdit />)
  try {
    await click(document.querySelector('[role="button"]'))
    assert.ok(document.querySelector('[role="dialog"]'))
    await ui.render(<TodoDeadlinesCard {...props} canEdit={false} />)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    await ui.render(<TodoDeadlinesCard {...props} canEdit />)
    assert.equal(document.querySelector('[role="dialog"]'), null)
  } finally { await ui.cleanup() }
})

test('date overview separates upcoming and past entries in date/time order with concise delivery details', async () => {
  const entries = [
    { ...existing, id: 'late', time: '14:00', note: 'Later upcoming' },
    { ...existing, id: 'old', date: '1999-01-01', reminderEnabled: false, note: 'Old past' },
    { ...existing, id: 'early', time: '08:00', reminderEnabled: false, note: 'First upcoming' },
    { ...existing, id: 'recent', date: '2000-01-01', type: 'appointment', reminderEnabled: false, note: 'Recent past' },
  ]
  const ui = await mount(<TodoDeadlinesCard todo={todo} users={users} todoId="task" canEdit={false} deadlines={entries} loading={false} />)
  try {
    const upcoming = document.querySelector('.todo-deadlines__group--upcoming')
    const past = document.querySelector('.todo-deadlines__group--past')
    assert.match(upcoming.querySelector('h4').textContent, /Bevorstehend2/)
    assert.deepEqual([...upcoming.querySelectorAll('.todo-deadline-row__note')].map(item => item.textContent), ['First upcoming', 'Later upcoming'])
    assert.deepEqual([...past.querySelectorAll('.todo-deadline-row__note')].map(item => item.textContent), ['Recent past', 'Old past'])
    assert.match(past.querySelector('h4').textContent, /Vergangen2/)
    assert.equal(document.querySelectorAll('details.todo-deadline-row__status').length, 1)
    assert.equal(document.querySelector('details.todo-deadline-row__status').open, false)
    assert.match(upcoming.textContent, /Abteilungskalender Ops/)
  } finally { await ui.cleanup() }
})

test('deadline dialog traps keyboard focus, closes with Escape and restores prior focus and scrolling', async () => {
  const previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'scroll'
  const outside = document.createElement('button'); outside.textContent = 'Outside'; document.body.append(outside); outside.focus()
  let closed = 0
  const ui = await mount(<DeadlineModal deadline={existing} todo={todo} users={users} onClose={() => { closed++ }} onSave={async () => {}} />)
  try {
    assert.equal(document.body.style.overflow, 'hidden')
    await act(async () => new Promise(resolve => requestAnimationFrame(resolve)))
    const buttons = document.querySelectorAll('[role="dialog"] button')
    const first = buttons[0]; const last = buttons[buttons.length - 1]
    last.focus()
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    assert.equal(document.activeElement === first, true, 'Tab should wrap to the first control')
    first.focus()
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    assert.equal(document.activeElement === last, true, 'Shift+Tab should wrap to the last control')
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(closed, 1)
  } finally {
    await ui.cleanup()
    assert.equal(document.activeElement === outside, true, 'Focus should return to the prior control')
    assert.equal(document.body.style.overflow, 'scroll')
    outside.remove(); document.body.style.overflow = previousOverflow
  }
})

test('deadline save carries the parent audience snapshot from opening despite live audience replacement', async () => {
  const openingTodo = { ...todo, audienceType: 'people', audienceId: null, audienceIds: ['alpha', 'beta'] }
  const expectedSnapshot = { ...openingTodo, audienceIds: [...openingTodo.audienceIds] }
  let originalParent; let savedDraft
  const onSave = async (_deadline, values, parent) => { originalParent = parent; savedDraft = values; throw new Error('Die Beteiligten wurden zwischenzeitlich geändert.') }
  const onClose = () => {}
  const ui = await mount(<DeadlineModal deadline={existing} todo={openingTodo} users={users} onClose={onClose} onSave={onSave} />)
  try {
    await enter(field('Hinweis'), 'Draft before audience update')
    // Also ensure the snapshot owns its audience array rather than retaining
    // a mutable alias from a caller or test boundary.
    openingTodo.audienceIds.push('other')
    await ui.render(<DeadlineModal deadline={existing} todo={{ ...todo, audienceId: 'Sales' }} users={users} onClose={onClose} onSave={onSave} />)
    await submit()
    assert.deepEqual(originalParent, expectedSnapshot)
    assert.equal(savedDraft.note, 'Draft before audience update')
    assert.equal(field('Hinweis').value, 'Draft before audience update')
    assert.match(document.body.textContent, /Beteiligten wurden zwischenzeitlich geändert/)
  } finally { await ui.cleanup() }
})

test('deadline delete carries the same opening parent snapshot after a live audience change', async () => {
  let originalParent
  const onDelete = async (_deadline, parent) => { originalParent = parent }
  const onClose = () => {}
  const ui = await mount(<DeadlineModal deadline={existing} todo={todo} users={users} onClose={onClose} onDelete={onDelete} onSave={async () => {}} />)
  try {
    await ui.render(<DeadlineModal deadline={existing} todo={{ ...todo, audienceType: 'people', audienceId: null, audienceIds: ['other'] }} users={users} onClose={onClose} onDelete={onDelete} onSave={async () => {}} />)
    await click(button('Löschen'))
    await click(button('Ja, löschen', document.querySelector('[role="alertdialog"]')))
    assert.deepEqual(originalParent, todo)
  } finally { await ui.cleanup() }
})

test('completed and withdrawn parents pause delivery presentation without discarding the saved reminder on reopen', async () => {
  const props = { users, todoId: 'task', deadlines: [existing], canEdit: true, loading: false }
  const ui = await mount(<TodoDeadlinesCard {...props} todo={{ ...todo, status: 'open' }} />)
  try {
    assert.match(document.querySelector('.todo-deadline-row__reminder').textContent, /Erinnerung an/)
    assert.ok(document.querySelector('.reminder-status'))
    await click(document.querySelector('[role="button"]'))
    assert.ok(document.querySelector('[role="dialog"]'))
    await ui.render(<TodoDeadlinesCard {...props} todo={{ ...todo, status: 'completed' }} />)
    assert.match(document.querySelector('.todo-deadline-row__reminder').textContent, /Erinnerung pausiert · To-do erledigt/)
    assert.equal(document.querySelector('.reminder-status'), null)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(button('Termin / Frist hinzufügen'), undefined)
    assert.match(document.querySelector('.todo-deadline-row__status').textContent, /wird keine Mail versendet/)
    await ui.render(<TodoDeadlinesCard {...props} todo={{ ...todo, status: 'withdrawn' }} />)
    assert.match(document.querySelector('.todo-deadline-row__reminder').textContent, /Erinnerung pausiert · To-do zurückgezogen/)
    assert.equal(document.querySelector('.reminder-status'), null)
    assert.equal(existing.reminderEnabled, true)
    await ui.render(<TodoDeadlinesCard {...props} todo={{ ...todo, status: 'open' }} />)
    assert.match(document.querySelector('.todo-deadline-row__reminder').textContent, /Erinnerung an/)
    assert.ok(document.querySelector('.reminder-status'))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.deepEqual(existing.reminderRecipientUserIds, ['alpha'])
  } finally { await ui.cleanup() }
})

test('date is required and validated even when email reminders are off', async () => {
  const saves = []
  const ui = await mount(<DeadlineModal deadline={{ ...existing, reminderEnabled: false }} todo={todo} users={users} onClose={() => {}} onSave={async (_entry, values) => saves.push(values)} />)
  try {
    await enter(field('Datum *'), '')
    await submit()
    assert.equal(saves.length, 0)
    assert.ok(document.querySelector('[role="alert"]'))
    await enter(field('Datum *'), '2099-12-02')
    await submit()
    assert.equal(saves[0].date, '2099-12-02')
    assert.equal(saves[0].reminderEnabled, false)
  } finally { await ui.cleanup() }
})

test('one selected reminder recipient is labeled as one person', async () => {
  const ui = await mount(<DeadlineModal deadline={existing} todo={todo} users={users} onClose={() => {}} onSave={async () => {}} />)
  try { assert.equal(document.querySelector('.todo-recipient-selection__count').textContent, '1 Person') }
  finally { await ui.cleanup() }
})

test('delete confirmation cancels independently with Escape or Cancel and preserves the entire draft', async () => {
  let closed = 0; let deleted = 0
  const ui = await mount(<DeadlineModal deadline={existing} todo={todo} users={users} onClose={() => { closed++ }} onDelete={async () => { deleted++ }} onSave={async () => {}} />)
  try {
    await enter(field('Hinweis'), 'Draft kept after deletion cancel')
    await click(button('Löschen'))
    assert.ok(document.querySelector('[role="alertdialog"]'))
    assert.equal(document.querySelector('.todo-deadline-modal').hasAttribute('inert'), true)
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="alertdialog"]'), null)
    assert.equal(closed, 0)
    assert.equal(deleted, 0)
    assert.equal(field('Hinweis').value, 'Draft kept after deletion cancel')
    assert.equal(document.querySelector('.todo-deadline-modal').hasAttribute('inert'), false)
    await click(button('Löschen'))
    await click(button('Abbrechen', document.querySelector('[role="alertdialog"]')))
    assert.equal(document.querySelector('[role="alertdialog"]'), null)
    assert.equal(closed, 0)
    assert.equal(deleted, 0)
    assert.equal(field('Hinweis').value, 'Draft kept after deletion cancel')
  } finally { await ui.cleanup() }
})

test('confirming deletion uses one pending action, disables confirmation buttons and prevents Escape from closing either dialog', async () => {
  let release; let deleted = 0; let closed = 0
  const pending = new Promise(resolve => { release = resolve })
  const ui = await mount(<DeadlineModal deadline={existing} todo={todo} users={users} onClose={() => { closed++ }} onDelete={async () => { deleted++; await pending }} onSave={async () => {}} />)
  try {
    await click(button('Löschen'))
    const confirmation = document.querySelector('[role="alertdialog"]')
    await click(button('Ja, löschen', confirmation))
    assert.equal(deleted, 1)
    assert([...confirmation.querySelectorAll('button')].every(item => item.disabled))
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.ok(document.querySelector('[role="alertdialog"]'))
    assert.equal(closed, 0)
    assert.equal(deleted, 1)
    await act(async () => release())
    assert.equal(closed, 1)
    assert.equal(document.querySelector('[role="alertdialog"]'), null)
  } finally { await act(async () => release()); await ui.cleanup() }
})
