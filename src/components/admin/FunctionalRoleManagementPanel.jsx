import { useState } from 'react'

export default function FunctionalRoleManagementPanel({ error, functionalRoles, saving, onCreate, onUpdate }) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

  async function create(event) {
    event.preventDefault()
    const name = newName.trim()
    if (name && await onCreate(name)) setNewName('')
  }

  async function saveRename(id) {
    const name = editingName.trim()
    if (name && await onUpdate(id, { name })) { setEditingId(null); setEditingName('') }
  }

  return <section className="admin-panel admin-departments">
    <div className="admin-panel__heading"><div><h2>Fachrollen</h2><p>Zentrale Verantwortlichkeiten für Prozessblöcke. Sie sind unabhängig von Systemrollen und Berechtigungen.</p></div></div>
    {error && <p className="form-error">{error}</p>}
    <form className="admin-departments__create" onSubmit={create}><input aria-label="Neue Fachrolle" placeholder="Neue Fachrolle" value={newName} onChange={(event) => setNewName(event.target.value)} disabled={saving} /><button className="button" type="submit" disabled={saving || !newName.trim()}>Fachrolle anlegen</button></form>
    <div className="admin-departments__list">{functionalRoles.length === 0 ? <p className="admin-departments__empty">Noch keine Fachrollen angelegt.</p> : functionalRoles.map((functionalRole) => <div className="admin-departments__row" key={functionalRole.id}>{editingId === functionalRole.id ? <input aria-label={`Fachrolle ${functionalRole.name} umbenennen`} value={editingName} onChange={(event) => setEditingName(event.target.value)} disabled={saving} /> : <span>{functionalRole.name}</span>}<span className={functionalRole.active ? 'admin-departments__status' : 'admin-departments__status admin-departments__status--inactive'}>{functionalRole.active ? 'Aktiv' : 'Inaktiv'}</span><div className="admin-departments__actions">{editingId === functionalRole.id ? <><button className="button button--secondary" type="button" disabled={saving || !editingName.trim()} onClick={() => { void saveRename(functionalRole.id) }}>Speichern</button><button className="button button--secondary" type="button" disabled={saving} onClick={() => { setEditingId(null); setEditingName('') }}>Abbrechen</button></> : <><button className="button button--secondary" type="button" disabled={saving} onClick={() => { setEditingId(functionalRole.id); setEditingName(functionalRole.name) }}>Umbenennen</button><button className="button button--secondary" type="button" disabled={saving} onClick={() => { void onUpdate(functionalRole.id, { active: !functionalRole.active }) }}>{functionalRole.active ? 'Deaktivieren' : 'Aktivieren'}</button></>}</div></div>)}</div>
  </section>
}
