import assert from 'node:assert/strict'
import test from 'node:test'
import { act, cloneElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import TodoDetailPage from '../../pages/TodoDetailPage.jsx'
import { DeadlineModal } from './TodoDeadlinesCard.jsx'
import TodosTable from './TodosTable.jsx'
import TodoForm from './TodoForm.jsx'
import LinkedTodoCreateModal from './LinkedTodoCreateModal.jsx'
import TodoQuickEditModal from './TodoQuickEditModal.jsx'
import { LanguageContext } from '../../i18n/languageContext.js'

const profile = (firstName, level = 'edit', department = 'Ops') => ({ active: true, role: 'user', firstName, lastName: 'Test', department, permissions: { todos: level } })
const directory = [
  { id: 'participant', ...profile('Participant') }, { id: 'viewer', ...profile('Viewer', 'view') },
  { id: 'outsider', ...profile('Outsider', 'edit', 'Sales') }, { id: 'owner', ...profile('Creator', 'edit', 'Sales') },
]
function reset(id = 'participant', changes = {}) {
  globalThis.__todoUiTest = {
    actor: { user: { uid: id }, profile: directory.find(entry => entry.id === id) }, users: directory, calls: [],
    todo: { id: 'task', title: 'Shared task', description: 'Initial content', creatorUserId: 'owner', creatorName: 'Creator Test', status: 'open', audienceType: 'people', audienceIds: ['participant', 'viewer'], audienceLabel: 'Participant Test, Viewer Test', priority: 'medium', ...changes },
    updates: [{ id: 'note', type: 'note', text: 'Readable team note', createdByName: 'Creator Test' }], deadlines: [],
  }
  return globalThis.__todoUiTest
}
async function mount(element = <TodoDetailPage />) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const render = () => root.render(<MemoryRouter initialEntries={['/todos/task']}><TestNavigation /><LanguageContext.Provider value={{ language: 'de', t: key => ({ 'common.cancel': 'Abbrechen', 'common.confirm': 'Bestätigen', 'common.back': 'Zurück' }[key] || key) }}><Routes><Route path="/todos/:todoId" element={cloneElement(element)} /></Routes></LanguageContext.Provider></MemoryRouter>)
  await act(async () => render())
  const cleanup = async () => { await act(async () => root.unmount()); container.remove() }
  cleanup.rerender = () => act(async () => render())
  return cleanup
}
function TestNavigation() {
  const navigate = useNavigate()
  useEffect(() => { globalThis.__todoUiTest.navigate = navigate }, [navigate])
  return null
}
async function remoteTodo(state, changes) {
  await act(async () => {
    state.todo = { ...state.todo, ...changes }
    for (const listener of state.listeners?.todo || []) listener.callback({ ...state.todo })
  })
}
const text = () => document.body.textContent
function button(label) { const result = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === label); assert.ok(result, `Missing button ${label}`); return result }
function field(label, selector = 'input,textarea,select') {
  const labels = [...document.querySelectorAll('label')]
  const match = labels.find(item => item.querySelector('span')?.textContent.trim() === label)
  assert.ok(match, `Missing label ${label}`)
  return match.querySelector(selector)
}
async function click(element) { assert.ok(element); await act(async () => element.click()) }
async function enter(element, value) {
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })) })
}
async function submit() { await act(async () => document.querySelector('form.todo-quick-editor').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }

test('current editor participant can change content and complete/reopen without accepting, but cannot change audience or withdraw', async () => {
  const state = reset()
  const cleanup = await mount()
  try {
    assert(!/annehmen|übernommen|freigeben/i.test(text()))
    assert.equal(document.querySelector('[title="Beteiligte bearbeiten"]'), null)
    assert(![...document.querySelectorAll('button')].some(item => item.textContent.trim() === 'Zurückziehen'))
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    await enter(field('Titel *'), 'Edited by participant')
    await submit()
    assert.equal(state.calls[0].name, 'update')
    assert.equal(state.calls[0].args[1].title, 'Edited by participant')
    assert.equal(state.calls[0].args[4].user.uid, 'participant')
    await click(button('Erledigen'))
    assert.match(text(), /für alle Beteiligten/)
    await click(button('Ja, erledigen'))
    assert(state.calls.some(call => call.name === 'complete'))
    await click(button('Wieder öffnen'))
    assert(state.calls.some(call => call.name === 'reopen'))
  } finally { await cleanup() }
})

test('view-only participant can read notes while content, dates and completion controls remain hidden', async () => {
  reset('viewer')
  const cleanup = await mount()
  try {
    assert.match(text(), /Readable team note/)
    assert.equal(document.querySelector('[aria-label="Titel bearbeiten"]'), null)
    assert(![...document.querySelectorAll('button')].some(item => ['Erledigen', 'Zurückziehen', 'Termin / Frist hinzufügen', 'Update hinzufügen'].includes(item.textContent.trim())))
  } finally { await cleanup() }
})

test('creator audience removal requires confirmation and intersects selected recipients with remaining audience', async () => {
  const state = reset('owner', { reminderRecipientMode: 'selected', reminderRecipientUserIds: ['participant', 'viewer'] })
  const cleanup = await mount()
  try {
    await click(document.querySelector('[title="Beteiligte bearbeiten"]'))
    const person = [...document.querySelectorAll('.todo-quick-editor__people label')].find(item => item.textContent === 'Viewer Test')
    await click(person.querySelector('input'))
    await submit()
    assert.equal(state.calls.length, 0)
    assert.match(document.querySelector('[role="alertdialog"]').textContent, /Kalendereinträge und Erinnerungen entfallen/)
    await click(button('Bestätigen'))
    assert.equal(state.calls[0].name, 'update')
    assert.deepEqual(state.calls[0].args[1].audienceIds, ['participant'])
    assert.deepEqual(state.calls[0].args[1].reminderRecipientUserIds, ['participant'])
  } finally { await cleanup() }
})

test('department date stays in department calendar while reminders select only current department participants', async () => {
  reset()
  const saves = []
  const todo = { id: 'task', audienceType: 'department', audienceId: 'Ops', creatorUserId: 'owner' }
  const cleanup = await mount(<DeadlineModal deadline={null} todo={todo} users={directory} onClose={() => {}} onDelete={() => {}} onSave={async (_deadline, values) => saves.push(values)} />)
  try {
    assert.match(text(), /Abteilungskalender Ops/)
    assert(!text().includes('Kalender / Mail-Erinnerung an'))
    await enter(field('Erinnerung'), 'on')
    await enter(field('Uhrzeit *'), '09:30')
    await enter(field('Mail-Erinnerung an'), 'selected')
    const options = document.querySelector('.todo-recipient-selection__people')
    assert(options.textContent.includes('Participant Test'))
    assert(options.textContent.includes('Viewer Test'))
    assert(!options.textContent.includes('Outsider Test'))
    assert(!options.textContent.includes('Creator Test'))
    await click([...options.querySelectorAll('label')].find(item => item.textContent === 'Participant Test').querySelector('input'))
    assert.match(text(), /Abteilungskalender Ops/)
    await submit()
    assert.equal(saves[0].reminderEnabled, true)
    assert.deepEqual(saves[0].reminderRecipientUserIds, ['participant'])
  } finally { await cleanup() }
})

test('personal calendar selection remains explicit with reminder off and empty selection warns without adding an outsider', async () => {
  reset()
  const saves = []
  const todo = globalThis.__todoUiTest.todo
  const deadline = { id: 'date', date: '2026-12-01', time: '', reminderEnabled: false, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['participant', 'outsider'] }
  const cleanup = await mount(<DeadlineModal deadline={deadline} todo={todo} users={directory} onClose={() => {}} onDelete={() => {}} onSave={async (_deadline, values) => saves.push(values)} />)
  try {
    assert.match(text(), /Persönliche Kalender: Participant Test/)
    assert(field('Kalender für'))
    assert(!document.querySelector('.todo-recipient-selection__people').textContent.includes('Outsider Test'))
    await click(document.querySelector('.todo-recipient-selection__people input:checked'))
    assert.match(text(), /Keine berechtigten Empfänger ausgewählt/)
    assert.match(text(), /Kein persönlicher Kalender ausgewählt/)
    await submit()
    assert.equal(saves[0].reminderEnabled, false)
    assert.deepEqual(saves[0].reminderRecipientUserIds, [])
  } finally { await cleanup() }
})

test('list table presents the shared audience with matching headers and cells, without an assignee column', async () => {
  const state = reset()
  const cleanup = await mount(<TodosTable todos={[{ ...state.todo, assignedUserName: 'Legacy assignee' }]} formatDate={value => value} onOpen={() => {}} />)
  try {
    assert.equal(document.querySelectorAll('thead th').length, document.querySelectorAll('tbody tr:first-child td').length)
    assert(!text().includes('Bearbeiter'))
    assert(!text().includes('Legacy assignee'))
  } finally { await cleanup() }
})

test('live task changes update the page while an open content form retains its original conflict snapshot and draft', async () => {
  const state = reset()
  const cleanup = await mount()
  try {
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    await enter(field('Titel *'), 'My unsaved draft')
    await remoteTodo(state, { title: 'Saved by colleague' })
    assert.match(document.querySelector('.todo-detail-header').textContent, /Saved by colleague/)
    assert.equal(field('Titel *').value, 'My unsaved draft')
    state.mutationError = new Error('Das To-do wurde zwischenzeitlich geändert. Bitte neu öffnen.')
    await submit()
    assert.equal(state.calls[0].args[0].title, 'Shared task')
    assert.match(document.querySelector('[role="dialog"]').textContent, /zwischenzeitlich geändert/)
    assert.equal(field('Titel *').value, 'My unsaved draft')
    await click(button('Abbrechen'))
    state.mutationError = null
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    assert.equal(field('Titel *').value, 'Saved by colleague')
  } finally { await cleanup() }
})

test('external completion closes content/date editors and confirmation; reopening does not resurrect old drafts', async () => {
  const state = reset()
  const cleanup = await mount()
  try {
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    await enter(field('Titel *'), 'Do not restore this draft')
    await remoteTodo(state, { status: 'completed' })
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.querySelector('[aria-label="Titel bearbeiten"]'), null)
    await click(button('Wieder öffnen'))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    await click(button('Termin / Frist hinzufügen'))
    await remoteTodo(state, { status: 'completed' })
    assert.equal(document.querySelector('[role="dialog"]'), null)
    await remoteTodo(state, { status: 'open' })
    assert.equal(document.querySelector('[role="dialog"]'), null)
    await click(button('Erledigen'))
    await remoteTodo(state, { status: 'completed' })
    assert.equal(document.querySelector('[role="alertdialog"]'), null)
  } finally { await cleanup() }
})

test('removal from a people audience immediately hides private contents, notes, dates and open modal', async () => {
  const state = reset()
  const cleanup = await mount()
  try {
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    await remoteTodo(state, { audienceIds: ['viewer'] })
    assert.match(text(), /Kein Zugriff/)
    assert(!text().includes('Initial content'))
    assert(!text().includes('Readable team note'))
    assert.equal(document.querySelector('[role="dialog"]'), null)
  } finally { await cleanup() }
})

test('department departure/rejoin and edit-to-view changes reauthorize an already open detail page', async () => {
  const state = reset('participant', { audienceType: 'department', audienceId: 'Ops' })
  const cleanup = await mount()
  try {
    await click(button('Termin / Frist hinzufügen'))
    state.actor = { ...state.actor, profile: { ...state.actor.profile, department: 'Sales' } }
    await cleanup.rerender()
    assert.match(text(), /Kein Zugriff/)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    state.actor = { ...state.actor, profile: { ...state.actor.profile, department: 'Ops' } }
    await cleanup.rerender()
    assert.match(text(), /Initial content/)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    state.actor = { ...state.actor, profile: { ...state.actor.profile, permissions: { todos: 'view' } } }
    await cleanup.rerender()
    assert.match(text(), /Initial content/)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert(![...document.querySelectorAll('button')].some(item => item.textContent === 'Erledigen'))
    state.actor = { ...state.actor, profile: { ...state.actor.profile, permissions: { todos: 'none' } } }
    await cleanup.rerender()
    assert.match(text(), /Kein Zugriff/)
    assert(!text().includes('Initial content'))
  } finally { await cleanup() }
})

test('listener permission failure clears all private material and closes any pending confirmation', async () => {
  const state = reset()
  const cleanup = await mount()
  try {
    await click(button('Erledigen'))
    await act(async () => { for (const listener of state.listeners.todo) listener.onError(Object.assign(new Error('denied'), { code: 'permission-denied' })) })
    assert.match(text(), /Kein Zugriff/)
    assert(!text().includes('Readable team note'))
    assert.equal(document.querySelector('[role="alertdialog"]'), null)
  } finally { await cleanup() }
})

test('confirmation and reopening each reserve only one mutation while the first is pending', async () => {
  const state = reset()
  const cleanup = await mount()
  let release
  try {
    await click(button('Erledigen'))
    state.pendingMutation = new Promise(resolve => { release = resolve })
    const confirm = button('Ja, erledigen')
    await act(async () => { confirm.click(); confirm.click() })
    assert.equal(state.calls.filter(call => call.name === 'complete').length, 1)
    assert([...document.querySelectorAll('[role="alertdialog"] button')].every(item => item.disabled))
    await act(async () => { release(); await state.pendingMutation })
    state.pendingMutation = new Promise(resolve => { release = resolve })
    const reopen = button('Wieder öffnen')
    await act(async () => { reopen.click(); reopen.click() })
    assert.equal(state.calls.filter(call => call.name === 'reopen').length, 1)
    await act(async () => { release(); await state.pendingMutation })
    assert(button('Erledigen'))
  } finally { release?.(); await cleanup() }
})

test('audience confirmation suspends the underlying editor and Escape returns to the unchanged draft', async () => {
  reset('owner')
  const cleanup = await mount()
  try {
    await click(document.querySelector('[title="Beteiligte bearbeiten"]'))
    await enter(field('Aufgabe für'), 'department')
    await enter(field('Abteilung'), 'Ops')
    await submit()
    assert(document.querySelector('[role="dialog"]').hasAttribute('inert'))
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="alertdialog"]'), null)
    assert.equal(field('Aufgabe für').value, 'department')
    assert.equal(field('Abteilung').value, 'Ops')
  } finally { await cleanup() }
})

test('outsider, inactive participant and missing permission never render cached private task data', async () => {
  for (const kind of ['outsider', 'inactive', 'none']) {
    const state = reset(kind === 'outsider' ? 'outsider' : 'participant')
    if (kind !== 'outsider') state.actor = { ...state.actor, profile: { ...state.actor.profile, ...(kind === 'inactive' ? { active: false } : { permissions: { todos: 'none' } }) } }
    const cleanup = await mount()
    try {
      assert.match(text(), /Kein Zugriff/)
      assert(!text().includes('Initial content'))
      assert(!text().includes('Readable team note'))
    } finally { await cleanup() }
  }
})

test('unavailable employee directory cannot wipe selected recipients during an unrelated content save', async () => {
  const state = reset('participant', { reminderRecipientMode: 'selected', reminderRecipientUserIds: ['participant', 'viewer'] })
  state.directoryError = Object.assign(new Error('synthetic network outage'), { code: 'unavailable' })
  const cleanup = await mount()
  try {
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    await enter(field('Titel *'), 'Only this title changes')
    await submit()
    assert.deepEqual(state.calls[0].args[1].reminderRecipientUserIds, ['participant', 'viewer'])
    assert.equal(button('Erledigen').disabled, false)
    assert(![...document.querySelectorAll('button')].some(item => item.textContent === 'Termin / Frist hinzufügen'))
    await click(document.querySelector('[aria-label="Terminierung bearbeiten"]'))
    await submit()
    assert.equal(state.calls.length, 1)
    assert.match(document.querySelector('[role="dialog"]').textContent, /Mitarbeiterliste konnte nicht geladen/)
  } finally { await cleanup() }
})

test('switching task routes clears all old task drafts and dialogs', async () => {
  const state = reset()
  const cleanup = await mount()
  try {
    await enter(document.querySelector('[aria-label="Update zum To-do"]'), 'Private note for task A only')
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    await enter(field('Titel *'), 'Draft for task A')
    state.todo = { ...state.todo, id: 'second-task', title: 'Task B' }
    await act(async () => state.navigate('/todos/second-task'))
    assert.match(document.querySelector('.todo-detail-header').textContent, /Task B/)
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.querySelector('[aria-label="Update zum To-do"]').value, '')
    assert.equal(state.calls.length, 0)
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    assert.equal(field('Titel *').value, 'Task B')
  } finally { await cleanup() }
})

test('a denied listener recovers on returning after the person has been re-added', async () => {
  const state = reset()
  const cleanup = await mount()
  try {
    await act(async () => { for (const listener of state.listeners.todo) listener.onError(Object.assign(new Error('removed'), { code: 'permission-denied' })) })
    assert.match(text(), /Kein Zugriff/)
    await act(async () => window.dispatchEvent(new Event('focus')))
    assert.match(text(), /Initial content/)
    assert(button('Erledigen'))
  } finally { await cleanup() }
})

test('deadline saves retain the audience revision from opening even when the live group changes', async () => {
  const state = reset()
  state.deadlines = [{ id: 'date', type: 'deadline', date: '2026-12-01', time: '', reminderEnabled: false, reminderRecipientMode: 'all', note: 'Initial date note' }]
  const cleanup = await mount()
  try {
    await click(document.querySelector('.todo-deadline-row__main[role="button"]'))
    await enter(field('Hinweis'), 'Unsaved date draft')
    await remoteTodo(state, { audienceType: 'department', audienceId: 'Ops', audienceIds: null })
    state.mutationError = Object.assign(new Error('Die Zuständigkeit wurde inzwischen geändert. Bitte erneut öffnen.'), { code: 'todo/stale-edit' })
    await submit()
    assert.equal(state.calls[0].name, 'deadline.update')
    assert.equal(state.calls[0].args[0].audienceType, 'people')
    assert.deepEqual(state.calls[0].args[0].audienceIds, ['participant', 'viewer'])
    assert.equal(field('Hinweis').value, 'Unsaved date draft')
    assert.match(document.querySelector('[role="dialog"]').textContent, /Zuständigkeit wurde inzwischen geändert/)
    assert.equal(state.deadlines[0].note, 'Initial date note')
  } finally { await cleanup() }
})

test('content modal traps keyboard focus, blocks duplicate submit and keeps a failed draft', async () => {
  const state = reset()
  const cleanup = await mount()
  let release
  try {
    const overflow = document.body.style.overflow
    await click(document.querySelector('[aria-label="Titel bearbeiten"]'))
    const title = field('Titel *')
    title.focus()
    await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    assert.equal(document.activeElement, button('Speichern'))
    await enter(title, 'Draft survives a save error')
    state.pendingMutation = new Promise(resolve => { release = resolve })
    state.mutationError = new Error('Verbindung unterbrochen. Bitte erneut versuchen.')
    await act(async () => {
      const form = document.querySelector('form.todo-quick-editor')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    assert.equal(state.calls.filter(call => call.name === 'update').length, 1)
    await act(async () => { release(); await state.pendingMutation })
    assert.equal(field('Titel *').value, 'Draft survives a save error')
    assert.match(document.querySelector('[role="dialog"]').textContent, /Verbindung unterbrochen/)
    await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.body.style.overflow, overflow)
  } finally { release?.(); await cleanup() }
})

test('create form saves content, priority and audience without any scheduling fields or hidden inherited reminder', async () => {
  reset()
  const saves = []
  const cleanup = await mount(<TodoForm currentUserId="participant" users={directory} initialValues={{ dueDate: '2099-12-01', reminderDate: '2099-12-01', reminderTime: '09:30', reminderOccurrence: 'later', reminderRecipientMode: 'selected', reminderRecipientUserIds: ['participant'] }} onCancel={() => {}} onSubmit={async values => saves.push(values)} />)
  try {
    assert.equal(document.querySelector('.todo-schedule'), null)
    assert.equal(document.querySelector('input[type="date"], input[type="time"]'), null)
    assert(!/Terminierung|Mail-Erinnerung|Fällig am/.test(text()))
    assert.equal(document.querySelectorAll('form.todo-form > fieldset > section').length, 3)
    await enter(field('Aufgabe für'), 'all')
    assert.equal(document.querySelector('.todo-form__selection-hint'), null)
    assert(!/übernehm|annehmen|Bearbeiter/.test(text()))
    await click(document.querySelector('input[name="priority"][value="high"]'))
    await enter(field('Titel *'), 'Plan the dates after creation')
    await act(async () => document.querySelector('form.todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(saves.length, 1)
    assert.equal(saves[0].audienceType, 'all')
    assert.equal(saves[0].priority, 'high')
    for (const key of ['dueDate', 'reminderDate', 'reminderTime']) assert.equal(saves[0][key], '')
    assert.equal(saves[0].reminderOccurrence, null)
    assert.equal(saves[0].reminderRecipientMode, 'all')
    assert.deepEqual(saves[0].reminderRecipientUserIds, [])
  } finally { await cleanup() }
})

test('case creation modals never inherit invisible dates or reminders and retain their fixed case link', async () => {
  for (const caseField of ['damageCaseId', 'inkassoCaseId', 'legalDisputeId', 'insolvencyId']) {
    reset()
    const saves = []
    const fixedLink = { field: caseField, id: 'case-1', label: 'Fall', value: 'Testfall', values: { title: 'Linked task', dueDate: '2099-12-01', reminderDate: '2099-12-01', reminderTime: '09:30' } }
    const cleanup = await mount(<LinkedTodoCreateModal currentUserId="participant" fixedLink={fixedLink} users={directory} partners={[]} onCancel={() => {}} onSubmit={async values => saves.push(values)} />)
    try {
      assert.equal(document.querySelector('input[type="date"], input[type="time"]'), null)
      await act(async () => document.querySelector('form.todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
      assert.equal(saves.length, 1)
      assert.equal(saves[0][caseField], 'case-1')
      assert.equal(saves[0].dueDate, '')
      assert.equal(saves[0].reminderDate, '')
      assert.equal(saves[0].reminderTime, '')
    } finally { await cleanup() }
  }
})

test('an unscheduled new to-do receives its first reminder, appointment and deadline on the detail page and retains them through completion and reopening', async () => {
  const state = reset()
  const createCleanup = await mount(<TodoForm currentUserId="participant" users={directory} onCancel={() => {}} onSubmit={async values => { state.todo = { ...state.todo, ...values, creatorUserId: 'participant', audienceType: 'all' } }} />)
  try {
    await enter(field('Titel *'), 'Created without dates')
    await act(async () => document.querySelector('form.todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(state.todo.reminderDate, '')
  } finally { await createCleanup() }
  const cleanup = await mount()
  try {
    await click(document.querySelector('[aria-label="Terminierung bearbeiten"]'))
    await enter(field('Fällig am'), '2099-12-02')
    await enter(field('Erinnerung am'), '2099-12-01')
    await submit()
    assert.equal(state.calls.length, 0)
    assert.match(text(), /Uhrzeit für die Erinnerung/)
    await enter(field('Uhrzeit *'), '09:30')
    await submit()
    assert.equal(state.todo.dueDate, '2099-12-02')
    assert.equal(state.todo.reminderDate, '2099-12-01')
    assert.equal(state.todo.reminderTime, '09:30')
    for (const type of ['appointment', 'deadline']) {
      await click(button('Termin / Frist hinzufügen'))
      await enter(field('Art *'), type)
      await enter(field('Datum *'), '2099-12-02')
      await enter(field('Erinnerung'), 'on')
      await enter(field('Uhrzeit *'), '10:00')
      await submit()
      assert.equal(document.querySelector('[role="dialog"]'), null)
    }
    assert.deepEqual(state.deadlines.map(entry => entry.type), ['appointment', 'deadline'])
    const dates = structuredClone(state.deadlines)
    await click(button('Erledigen'))
    await click(button('Ja, erledigen'))
    assert.equal(state.todo.status, 'completed')
    assert(![...document.querySelectorAll('button')].some(item => item.textContent.trim() === 'Termin / Frist hinzufügen'))
    await click(button('Wieder öffnen'))
    assert.equal(state.todo.status, 'open')
    assert(button('Termin / Frist hinzufügen'))
    assert.deepEqual(state.deadlines, dates)
    assert.equal(state.todo.reminderTime, '09:30')
  } finally { await cleanup() }
})

test('schedule quick editor uses the same fields and closing reminder help keeps the edit dialog open', async () => {
  const state = reset('participant', { dueDate: '2099-12-01', reminderDate: '2099-12-01', reminderTime: '09:30', reminderRecipientMode: 'selected', reminderRecipientUserIds: ['participant'] })
  const saves = []
  const cleanup = await mount(<TodoQuickEditModal currentUserId="participant" users={directory} todo={state.todo} section="schedule" onCancel={() => { throw new Error('Help Escape must not close the modal') }} onSubmit={async values => saves.push(values)} />)
  try {
    assert.equal(document.querySelectorAll('.todo-schedule').length, 1)
    assert.equal(document.activeElement.value, 'medium')
    await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    assert.equal(document.activeElement, button('Speichern'))
    const help = document.querySelector('.todo-reminder-help')
    await click(help.querySelector('summary'))
    await act(async () => help.querySelector('summary').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(help.open, false)
    assert(document.querySelector('[role="dialog"]'))
    await enter(field('Uhrzeit *'), '10:15')
    await submit()
    assert.equal(saves[0].reminderTime, '10:15')
    assert.deepEqual(saves[0].reminderRecipientUserIds, ['participant'])
    assert.equal(saves[0].dueDate, '2099-12-01')
  } finally { await cleanup() }
})
