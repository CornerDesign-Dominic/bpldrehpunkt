import { useEffect, useRef, useState } from 'react'
import { listCaseReminderUsers, setReminderResponsibility } from '../../lib/reminders.js'
import { useLanguage } from '../../i18n/useLanguage.js'

export default function CaseReminderResponsibility({ parentPath, responsibleUserId, responsibleUserName, canEdit, onChanged }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const request = useRef(0)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [directoryError, setDirectoryError] = useState(false)
  const [users, setUsers] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [expectedId, setExpectedId] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => () => { request.current += 1 }, [parentPath])

  async function loadUsers() {
    const sequence = ++request.current
    setLoading(true); setDirectoryError(false); setError('')
    try { const options = await listCaseReminderUsers(parentPath); if (request.current === sequence) setUsers(options) }
    catch { if (request.current === sequence) { setDirectoryError(true); setError(en ? 'Eligible users could not be loaded. Please try again.' : 'Berechtigte Nutzer konnten nicht geladen werden. Bitte erneut versuchen.') } }
    finally { if (request.current === sequence) setLoading(false) }
  }
  function beginEditing() {
    setSelectedId(responsibleUserId || ''); setExpectedId(responsibleUserId || null); setEditing(true); setUsers([]); void loadUsers()
  }
  function cancel() { request.current += 1; setEditing(false); setError('') }
  async function save() {
    setSaving(true); setError('')
    let result
    try { result = await setReminderResponsibility(parentPath, selectedId || null, expectedId) }
    catch (failure) {
      setError(failure?.code === 'functions/aborted'
        ? (en ? 'Responsibility changed in the meantime. Your selection is retained. Cancel and check the current case before trying again.' : 'Die Zuständigkeit wurde zwischenzeitlich geändert. Deine Auswahl bleibt erhalten. Bitte abbrechen und den aktuellen Fall prüfen, bevor du erneut speicherst.')
        : (en ? 'Responsibility could not be saved. Your selection is retained.' : 'Die Zuständigkeit konnte nicht gespeichert werden. Deine Auswahl bleibt erhalten.'))
      setSaving(false); return
    }
    setEditing(false); setSaving(false)
    // A confirmed save must never be presented as a failed mutation because a
    // following case/history reload failed.
    try { await onChanged?.(result) }
    catch { setError(en ? 'Responsibility was saved, but the view could not be refreshed. Please reload.' : 'Die Zuständigkeit wurde gespeichert, aber die Ansicht konnte nicht aktualisiert werden. Bitte erneut laden.') }
  }
  const currentMissing = selectedId && !users.some((entry) => entry.id === selectedId)
  return <section className="todo-detail-content case-reminder-responsibility">
    <div className="todo-detail-section-heading"><h3>{en ? 'Responsibility' : 'Zuständigkeit'}</h3>{canEdit && !editing && <button className="button button--secondary" type="button" onClick={beginEditing}>{en ? 'Change responsibility' : 'Zuständigkeit ändern'}</button>}</div>
    {!editing ? <p>{responsibleUserId ? responsibleUserName || (en ? 'Responsible user' : 'Zuständiger Nutzer') : responsibleUserName ? `${responsibleUserName} · ${en ? 'no user linked' : 'keine Nutzerzuordnung'}` : (en ? 'Not assigned' : 'Nicht zugeordnet')}</p> : <div className="todo-quick-editor">
      <label className="form-field"><span>{en ? 'Responsible user' : 'Zuständiger Nutzer'}</span><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); if (!directoryError) setError('') }} disabled={saving || loading}>
        <option value="">{en ? 'Not assigned' : 'Nicht zugeordnet'}</option>
        {currentMissing && <option value={selectedId}>{responsibleUserName || selectedId} · {loading ? (en ? 'current selection' : 'aktuelle Auswahl') : (en ? 'not currently eligible' : 'derzeit nicht berechtigt')}</option>}
        {users.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}{entry.canReceiveMail === false ? (en ? ' · email configuration missing' : ' · Mailkonfiguration fehlt') : ''}</option>)}
      </select></label>
      {loading && <p role="status">{en ? 'Loading eligible users…' : 'Berechtigte Nutzer werden geladen …'}</p>}
      <div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={cancel}>{en ? 'Cancel' : 'Abbrechen'}</button><button className="button" type="button" disabled={saving || loading || directoryError} onClick={save}>{saving ? (en ? 'Saving…' : 'Wird gespeichert …') : (en ? 'Save' : 'Speichern')}</button>{directoryError && <button className="button button--secondary" type="button" disabled={saving || loading} onClick={loadUsers}>{en ? 'Reload users' : 'Nutzer erneut laden'}</button>}</div>
    </div>}
    <p className="form-field__hint">{en ? 'Only currently responsible users with active access can receive reminders. Without an eligible recipient, no email is sent.' : 'Erinnerungen erhalten nur aktuell zuständige Nutzer mit aktivem Zugriff. Ohne berechtigte Empfänger wird keine Mail versendet.'}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>
}
