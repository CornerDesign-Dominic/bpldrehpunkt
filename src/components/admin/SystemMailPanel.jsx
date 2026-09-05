import { useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../lib/firebase.js'

const PLACEHOLDER_DESCRIPTIONS = {
  employeeName: 'Name des Antragstellers',
  department: 'Abteilung des Antragstellers',
  period: 'Beantragter Zeitraum',
  oldPeriod: 'Bisheriger Zeitraum',
  newPeriod: 'Neuer gewünschter Zeitraum',
  days: 'Anzahl beantragter Urlaubstage',
  vacationType: 'Beantragte Urlaubsart',
  comment: 'Kommentar des Antragstellers',
  requestLabel: 'Bezeichnung des Antrags',
  managerComment: 'Kommentar der genehmigenden Person',
}

const cloneTemplate = (template) => ({ ...template, allowedPlaceholders: [...(template.allowedPlaceholders || [])] })

export default function SystemMailPanel() {
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const subjectRef = useRef(null)
  const messageRef = useRef(null)
  const lastFieldRef = useRef({ field: 'message', start: 0, end: 0 })

  useEffect(() => {
    let active = true
    httpsCallable(functions, 'listSystemMailTemplates')()
      .then((result) => {
        if (!active) return
        const loadedTemplates = result.data?.templates || []
        setTemplates(loadedTemplates)
        setEditing(loadedTemplates[0] ? cloneTemplate(loadedTemplates[0]) : null)
        if (loadedTemplates[0]) lastFieldRef.current = { field: 'message', start: loadedTemplates[0].message?.length || 0, end: loadedTemplates[0].message?.length || 0 }
      })
      .catch(() => { if (active) setError('Systemmail-Vorlagen konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function selectTemplate(template) {
    setEditing(cloneTemplate(template))
    setError('')
    lastFieldRef.current = { field: 'message', start: template.message?.length || 0, end: template.message?.length || 0 }
  }

  function rememberField(field, event) {
    const input = event.currentTarget
    lastFieldRef.current = { field, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length }
  }

  function updateField(field, value, event) {
    setEditing((current) => ({ ...current, [field]: value }))
    rememberField(field, event)
  }

  function insertPlaceholder(name) {
    if (!editing) return
    const token = `{{${name}}}`
    const remembered = lastFieldRef.current
    const field = remembered?.field === 'subject' ? 'subject' : 'message'
    const source = editing[field] || ''
    const start = Math.max(0, Math.min(remembered?.start ?? source.length, source.length))
    const end = Math.max(start, Math.min(remembered?.end ?? source.length, source.length))
    const cursor = start + token.length
    setEditing((current) => ({ ...current, [field]: `${current[field].slice(0, start)}${token}${current[field].slice(end)}` }))
    lastFieldRef.current = { field, start: cursor, end: cursor }
    requestAnimationFrame(() => {
      const input = field === 'subject' ? subjectRef.current : messageRef.current
      input?.focus()
      input?.setSelectionRange(cursor, cursor)
    })
  }

  async function save(event) {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      const result = await httpsCallable(functions, 'updateSystemMailTemplate')({ id: editing.id, subject: editing.subject, message: editing.message })
      const savedTemplate = { ...editing, ...result.data.template }
      setTemplates((current) => current.map((template) => template.id === editing.id ? savedTemplate : template))
      setEditing(cloneTemplate(savedTemplate))
    } catch (saveError) {
      setError(saveError?.message?.replace(/^.*?:\s*/, '') || 'Systemmail-Vorlage konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    const savedTemplate = templates.find((template) => template.id === editing?.id)
    if (savedTemplate) selectTemplate(savedTemplate)
  }

  if (loading) return <section className="system-mail-panel"><p>Vorlagen werden geladen …</p></section>

  return <section className="system-mail-panel" aria-label="Systemmail-Vorlagen">
    {error && <p className="form-error">{error}</p>}
    <div className="system-mail-workspace">
      <aside className="system-mail-templates" aria-label="Systemmail-Vorlagen">
        <div className="system-mail-workspace__heading"><h2>Vorlagen</h2><span>{templates.length}</span></div>
        <div className="system-mail-templates__list">{templates.map((template) => <button key={template.id} className={template.id === editing?.id ? 'system-mail-template system-mail-template--active' : 'system-mail-template'} type="button" aria-pressed={template.id === editing?.id} onClick={() => selectTemplate(template)}>{template.displayName}</button>)}</div>
      </aside>

      {editing ? <form className="system-mail-editor" onSubmit={save}>
        <div className="system-mail-editor__heading"><div><h2>{editing.displayName}</h2><p>Betreff und Nachricht dieser Vorlage bearbeiten.</p></div></div>
        <label className="form-field"><span>Betreff</span><input ref={subjectRef} value={editing.subject} maxLength="240" onFocus={(event) => rememberField('subject', event)} onSelect={(event) => rememberField('subject', event)} onKeyUp={(event) => rememberField('subject', event)} onChange={(event) => updateField('subject', event.target.value, event)} /></label>
        <label className="form-field system-mail-editor__message"><span>Nachricht</span><textarea ref={messageRef} rows="12" value={editing.message} maxLength="12000" onFocus={(event) => rememberField('message', event)} onSelect={(event) => rememberField('message', event)} onKeyUp={(event) => rememberField('message', event)} onChange={(event) => updateField('message', event.target.value, event)} /></label>
        <div className="system-mail-editor__actions"><button className="button button--secondary" type="button" onClick={cancel} disabled={saving}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
      </form> : <section className="system-mail-editor system-mail-editor--empty"><h2>Keine Vorlage verfügbar</h2><p>Es wurden keine Systemmail-Vorlagen gefunden.</p></section>}

      <aside className="system-mail-variables" aria-label="Erlaubte Variablen">
        <div className="system-mail-workspace__heading"><h2>Variablen</h2><span>{editing?.allowedPlaceholders?.length || 0}</span></div>
        {editing?.allowedPlaceholders?.length ? <div className="system-mail-variables__list">{editing.allowedPlaceholders.map((name) => <article className="system-mail-variable" key={name}><code>{`{{${name}}}`}</code><p>{PLACEHOLDER_DESCRIPTIONS[name] || 'Für diese Vorlage verfügbar.'}</p><button className="button button--secondary" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertPlaceholder(name)}>Einsetzen</button></article>)}</div> : <p className="system-mail-variables__empty">Für diese Vorlage sind keine Variablen erlaubt.</p>}
      </aside>
    </div>
  </section>
}
