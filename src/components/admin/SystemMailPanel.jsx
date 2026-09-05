import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase.js'

export default function SystemMailPanel() {
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    httpsCallable(functions, 'listSystemMailTemplates')()
      .then((result) => { if (active) setTemplates(result.data?.templates || []) })
      .catch(() => { if (active) setError('Systemmail-Vorlagen konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await httpsCallable(functions, 'updateSystemMailTemplate')({ id: editing.id, subject: editing.subject, message: editing.message })
      setTemplates((current) => current.map((template) => template.id === editing.id ? { ...template, ...result.data.template } : template))
      setEditing(null)
    } catch (saveError) {
      setError(saveError?.message?.replace(/^.*?:\s*/, '') || 'Systemmail-Vorlage konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="admin-panel system-mail-panel"><div className="admin-panel__heading"><div><h2>Systemmails</h2><p>Textvorlagen für automatisch versendete Systemmails.</p></div></div>{error && <p className="form-error">{error}</p>}{loading ? <p>Vorlagen werden geladen …</p> : editing ? <form className="system-mail-editor" onSubmit={save}><h3>{editing.displayName}</h3><p className="system-mail-placeholders">Erlaubte Platzhalter: {editing.allowedPlaceholders.length ? editing.allowedPlaceholders.map((item) => `{{${item}}}`).join(', ') : 'Keine'}</p><label className="form-field"><span>Betreff</span><input value={editing.subject} maxLength="240" onChange={(event) => setEditing((current) => ({ ...current, subject: event.target.value }))} /></label><label className="form-field"><span>Nachricht</span><textarea rows="10" value={editing.message} maxLength="12000" onChange={(event) => setEditing((current) => ({ ...current, message: event.target.value }))} /></label><div className="admin-panel__actions"><button className="button button--secondary" type="button" onClick={() => setEditing(null)}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div></form> : <div className="system-mail-list">{templates.map((template) => <article key={template.id} className="system-mail-list__item"><div><h3>{template.displayName}</h3><p><strong>Betreff:</strong> {template.subject}</p><pre>{template.message}</pre><small>Platzhalter: {template.allowedPlaceholders.length ? template.allowedPlaceholders.map((item) => `{{${item}}}`).join(', ') : 'Keine'}</small></div><button className="button button--secondary" type="button" onClick={() => setEditing(template)}>Bearbeiten</button></article>)}</div>}</section>
}
