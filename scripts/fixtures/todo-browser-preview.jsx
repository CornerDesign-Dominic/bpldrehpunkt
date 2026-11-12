import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TodoDetailPage from '../../src/pages/TodoDetailPage.jsx'
import TodosPage from '../../src/pages/TodosPage.jsx'
import { LanguageContext } from '../../src/i18n/languageContext.js'
import { useAuth } from './todo-browser-boundaries.jsx'
import '../../src/styles/global.css'
import '../../src/styles/todos.css'

const people = [{ id: 'owner', name: 'Clara · Erstellerin' }, { id: 'alice', name: 'Anna · Bearbeiterin' }, { id: 'bob', name: 'Ben · Bearbeiter' }, { id: 'viewer', name: 'Lena · Leserecht' }, { id: 'outsider', name: 'Oskar · außerhalb' }]
export function Preview() {
  const { user, profile } = useAuth()
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState('alice')
  const [department, setDepartment] = useState('Buchhaltung')
  const [level, setLevel] = useState('edit')
  const [active, setActive] = useState(true)
  async function action(path, values) {
    setMessage('Teständerung wird gespeichert …')
    const response = await fetch(`/__todo_qa/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values || {}) })
    const result = await response.json()
    setMessage(result.ok ? 'Teständerung gespeichert.' : result.error)
  }
  return <LanguageContext.Provider value={{ language: 'de', t: key => ({ 'common.cancel': 'Abbrechen', 'common.confirm': 'Bestätigen', 'common.back': 'Zurück' }[key] || key) }}>
    <header style={{ padding: '12px 20px', background: '#202f3d', color: '#fff', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>Lokale Prüfung · synthetische Daten</strong><label>Testnutzer <select aria-label="Testnutzer" value={user.uid} onChange={event => { location.href = `/qa?actor=${event.target.value}` }}>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <span>{profile?.department} · {profile?.permissions?.todos} · {profile?.active ? 'aktiv' : 'inaktiv'}</span><a href={`/qa?actor=${user.uid}&view=list`} style={{ color: '#fff' }}>To-do-Liste</a><a href={`/qa?actor=${user.uid}`} style={{ color: '#fff' }}>Detailseite</a>
    </header>
    <details style={{ padding: '10px 20px', background: '#e6edf3' }}><summary>Teststeuerung: Abteilung, Rechte und fremde Änderungen</summary><div style={{ display: 'flex', alignItems: 'end', gap: 12, paddingTop: 12, flexWrap: 'wrap' }}>
      <label>Profil <select aria-label="Testprofil" value={target} onChange={event => setTarget(event.target.value)}>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label>Abteilung <select aria-label="Testabteilung" value={department} onChange={event => setDepartment(event.target.value)}><option>Buchhaltung</option><option>Disposition</option></select></label>
      <label>Rechte <select aria-label="Testrechte" value={level} onChange={event => setLevel(event.target.value)}><option value="edit">Bearbeiten</option><option value="view">Lesen</option><option value="none">Kein Zugriff</option></select></label>
      <label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Aktiv</label>
      <button onClick={() => action('profile', { id: target, department, level, active })}>Testprofil aktualisieren</button>
      <button onClick={() => action('external-title')}>Fremde Titeländerung simulieren</button><button onClick={() => action('reset')}>Testdaten zurücksetzen</button><span role="status">{message}</span>
    </div></details>
    <main className="app-content" style={{ margin: '0 auto', padding: '24px', maxWidth: 1320 }}><MemoryRouter initialEntries={[new URLSearchParams(location.search).get('view') === 'list' ? '/todos' : '/todos/task']}><Routes><Route path="/todos" element={<TodosPage />} /><Route path="/todos/:todoId" element={<TodoDetailPage />} /></Routes></MemoryRouter></main>
  </LanguageContext.Provider>
}
const previewRoot = import.meta.hot?.data.previewRoot || createRoot(document.getElementById('root'))
if (import.meta.hot) import.meta.hot.data.previewRoot = previewRoot
previewRoot.render(<Preview />)
