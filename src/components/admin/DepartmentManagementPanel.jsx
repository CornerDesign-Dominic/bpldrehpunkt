import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'

export default function DepartmentManagementPanel({ departments, error, saving, onCreate, onUpdate }) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

  async function create(event) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    if (await onCreate(name)) setNewName('')
  }

  async function saveRename(id) {
    const name = editingName.trim()
    if (!name) return
    if (await onUpdate(id, { name })) {
      setEditingId(null)
      setEditingName('')
    }
  }

  return <section className="admin-panel admin-departments">
    <div className="admin-panel__heading"><div><h2><StaticText source={"Abteilungen"} /></h2><p><StaticText source={"Zentrale Abteilungen für Mitarbeiter, Zuständigkeiten und weitere Module."} /></p></div></div>
    {error && <p className="form-error">{<StaticText source={error} />}</p>}
    <form className="admin-departments__create" onSubmit={create}>
      <TranslatedProps sources={{"aria-label":"Neue Abteilung","placeholder":"Neue Abteilung"}}><input aria-label="Neue Abteilung" placeholder="Neue Abteilung" value={newName} onChange={(event) => setNewName(event.target.value)} disabled={saving} /></TranslatedProps>
      <button className="button" type="submit" disabled={saving || !newName.trim()}><StaticText source={"Abteilung anlegen"} /></button>
    </form>
    <div className="admin-departments__list">
      {departments.length === 0 ? <p className="admin-departments__empty"><StaticText source={"Noch keine Abteilungen angelegt."} /></p> : departments.map((department) => <div className="admin-departments__row" key={department.id}>
        {editingId === department.id ? <input aria-label={`Abteilung ${department.name} umbenennen`} value={editingName} onChange={(event) => setEditingName(event.target.value)} disabled={saving} /> : <span>{department.name}</span>}
        <span className={department.active ? 'admin-departments__status' : 'admin-departments__status admin-departments__status--inactive'}>{<StaticText source={department.active ? 'Aktiv' : 'Inaktiv'} />}</span>
        <div className="admin-departments__actions">{editingId === department.id ? <><button className="button button--secondary" type="button" disabled={saving || !editingName.trim()} onClick={() => { void saveRename(department.id) }}><StaticText source={"Speichern"} /></button><button className="button button--secondary" type="button" disabled={saving} onClick={() => { setEditingId(null); setEditingName('') }}><StaticText source={"Abbrechen"} /></button></> : <><button className="button button--secondary" type="button" disabled={saving} onClick={() => { setEditingId(department.id); setEditingName(department.name) }}><StaticText source={"Umbenennen"} /></button><button className="button button--secondary" type="button" disabled={saving} onClick={() => { void onUpdate(department.id, { active: !department.active }) }}>{department.active ? 'Deaktivieren' : 'Aktivieren'}</button></>}</div>
      </div>)}
    </div>
  </section>
}
