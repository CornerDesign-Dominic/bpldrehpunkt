import { useMemo, useState } from 'react'

const levelLabels = { none: 'Kein Zugriff', view: 'Ansehen', edit: 'Bearbeiten' }

export default function CalendarManagementPanel({ calendars, users, permissionsByCalendar, error, saving, onCreate, onUpdate, onSavePermissions }) {
  const sharedCalendars = useMemo(() => calendars.filter((calendar) => calendar.kind === 'shared'), [calendars])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#55758d')
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: '', color: '#55758d' })
  const [permissionDrafts, setPermissionDrafts] = useState({})
  const selected = sharedCalendars.find((calendar) => calendar.id === selectedId) || sharedCalendars[0] || null
  const activeUsers = users.filter((user) => user.active !== false).sort((left, right) => `${left.firstName || ''} ${left.lastName || ''}`.localeCompare(`${right.firstName || ''} ${right.lastName || ''}`, 'de'))
  const currentPermissions = selected ? permissionsByCalendar[selected.id] || {} : {}
  const permissionDraft = selected ? permissionDrafts[selected.id] || currentPermissions : {}
  const permissionLevel = (userId) => levelLabels[permissionDraft[userId]] ? permissionDraft[userId] : 'none'
  const allLevel = activeUsers.length && activeUsers.every((user) => permissionLevel(user.id) === permissionLevel(activeUsers[0].id)) ? permissionLevel(activeUsers[0].id) : null
  const hasPermissionChanges = selected && activeUsers.some((user) => permissionLevel(user.id) !== (levelLabels[currentPermissions[user.id]] ? currentPermissions[user.id] : 'none'))

  async function create(event) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    const id = await onCreate({ name, color: newColor })
    if (id) {
      setNewName('')
      setSelectedId(id)
    }
  }

  async function saveCalendar(event) {
    event.preventDefault()
    if (!selected || !draft.name.trim()) return
    if (await onUpdate(selected.id, { name: draft.name, color: draft.color })) setEditing(false)
  }

  function startEdit() {
    if (!selected) return
    setDraft({ name: selected.name, color: selected.color })
    setEditing(true)
  }

  function setPermission(userId, level) {
    if (!selected) return
    setPermissionDrafts((drafts) => ({ ...drafts, [selected.id]: { ...currentPermissions, ...(drafts[selected.id] || {}), [userId]: level } }))
  }

  function setAllPermissions(level) {
    if (!selected) return
    setPermissionDrafts((drafts) => ({ ...drafts, [selected.id]: Object.fromEntries(activeUsers.map((user) => [user.id, level])) }))
  }

  async function savePermissions() {
    if (!selected || !hasPermissionChanges) return
    const permissions = Object.fromEntries(activeUsers.map((user) => [user.id, permissionLevel(user.id)]))
    if (await onSavePermissions(selected.id, permissions)) {
      setPermissionDrafts((drafts) => {
        const next = { ...drafts }
        delete next[selected.id]
        return next
      })
    }
  }

  return <section className="admin-panel admin-calendars">
    <div className="admin-panel__heading"><div><h2>Gemeinsame Kalender</h2><p>Kalender, Farben und Zugriffsrechte unabhängig von Abteilungen verwalten.</p></div></div>
    {error && <p className="form-error">{error}</p>}
    <form className="admin-calendars__create" onSubmit={(event) => { void create(event) }}>
      <input aria-label="Name des neuen Kalenders" placeholder="Neuer Kalender" value={newName} onChange={(event) => setNewName(event.target.value)} disabled={saving} />
      <input aria-label="Farbe des neuen Kalenders" type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} disabled={saving} />
      <button className="button" type="submit" disabled={saving || !newName.trim()}>Kalender anlegen</button>
    </form>
    {sharedCalendars.length === 0 ? <p className="admin-calendars__empty">Noch keine gemeinsamen Kalender angelegt.</p> : <div className="admin-calendars__workspace">
      <div className="admin-calendars__list">{sharedCalendars.map((calendar) => <button type="button" key={calendar.id} className={calendar.id === selected?.id ? 'admin-calendars__item admin-calendars__item--active' : 'admin-calendars__item'} onClick={() => { setSelectedId(calendar.id); setEditing(false) }}><span className="calendar-color-dot" style={{ background: calendar.color }} /><span>{calendar.name}</span>{!calendar.active && <small>Archiviert</small>}</button>)}</div>
      {selected && <div className="admin-calendars__details">
        {editing ? <form className="admin-calendars__edit" onSubmit={(event) => { void saveCalendar(event) }}><label className="form-field"><span>Name</span><input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label className="form-field"><span>Farbe</span><input type="color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} /></label><div><button className="button button--secondary" type="button" disabled={saving} onClick={() => { setDraft({ name: selected.name, color: selected.color }); setEditing(false) }}>Abbrechen</button><button className="button" type="submit" disabled={saving || !draft.name.trim()}>Speichern</button></div></form> : <div className="admin-calendars__selected-heading"><div><span className="calendar-color-dot" style={{ background: selected.color }} /><strong>{selected.name}</strong>{!selected.active && <small>Archiviert</small>}</div><div><button className="button button--secondary" type="button" disabled={saving} onClick={startEdit}>Bearbeiten</button><button className="button button--secondary" type="button" disabled={saving} onClick={() => { void onUpdate(selected.id, { active: !selected.active }) }}>{selected.active ? 'Archivieren' : 'Reaktivieren'}</button></div></div>}
        <div className="admin-calendar-permissions"><div className="admin-calendar-permissions__heading"><div><h3>Zugriffe</h3><p>Persönliche Kalender werden automatisch für den jeweiligen Nutzer angelegt und hier nicht verwaltet.</p></div><button className="button" type="button" disabled={saving || !selected.active || !hasPermissionChanges} onClick={() => { void savePermissions() }}>Änderungen speichern</button></div><div className="admin-calendar-permissions__list"><div className="admin-calendar-permission-row admin-calendar-permission-row--all"><strong>Alle aktiven Nutzer</strong><div className="admin-permission-control" role="group" aria-label="Berechtigung für alle aktiven Nutzer">{Object.entries(levelLabels).map(([level, label]) => <button key={level} type="button" className={allLevel === level ? 'admin-permission-control__option admin-permission-control__option--active' : 'admin-permission-control__option'} aria-pressed={allLevel === level} disabled={saving || !selected.active} onClick={() => setAllPermissions(level)}>{label}</button>)}</div></div>{activeUsers.map((user) => { const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Benutzer'; const level = permissionLevel(user.id); return <div className="admin-calendar-permission-row" key={user.id}><span>{name}</span><div className="admin-permission-control" role="group" aria-label={`${name} Berechtigung`}>{Object.entries(levelLabels).map(([value, label]) => <button key={value} type="button" className={level === value ? 'admin-permission-control__option admin-permission-control__option--active' : 'admin-permission-control__option'} aria-pressed={level === value} disabled={saving || !selected.active} onClick={() => setPermission(user.id, value)}>{label}</button>)}</div></div> })}</div>{activeUsers.length === 0 && <p className="admin-calendars__empty">Keine aktiven Nutzer vorhanden.</p>}</div>
      </div>}
    </div>}
  </section>
}
