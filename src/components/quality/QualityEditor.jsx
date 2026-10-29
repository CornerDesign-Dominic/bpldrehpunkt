import { useEffect, useRef, useState } from 'react'
import { listQualityHistory, saveQualityRecord } from '../../lib/quality.js'
import { HANDBOOK_FIELDS, MEETING_FIELDS, PHASES, qualityValues, nextQualityCycle } from '../../lib/qualityPresentation.js'
import { qualityLabels as labels } from '../../lib/qualityLabels.js'

export default function QualityEditor({ kind, record, departmentId, topics, focusPhase, newCycle = false, editable, onClose, onSaved, language }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const [form, setForm] = useState(() => newCycle ? nextQualityCycle(qualityValues(kind, record, departmentId)) : qualityValues(kind, record, departmentId))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historical, setHistorical] = useState(null)
  const [discard, setDiscard] = useState(false)
  const [conflict, setConflict] = useState(false)
  const dialog = useRef(null)
  const [initial] = useState(() => JSON.stringify(qualityValues(kind, record, departmentId)))
  const dirty = JSON.stringify(form) !== initial
  const readOnly = !editable || Boolean(historical)
  const displayed = historical || form

  useEffect(() => {
    const previous = document.activeElement
    const element = dialog.current
    element.showModal()
    if (focusPhase) element.querySelector(`[name="${focusPhase}"]`)?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus?.() }
  }, [focusPhase])

  useEffect(() => {
    if (!dirty) return undefined
    const prevent = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])

  useEffect(() => {
    if (discard) dialog.current?.querySelector('.quality-discard button')?.focus()
  }, [discard])

  function close() {
    if (saving) return
    if (dirty) setDiscard(true)
    else onClose({ reload: conflict })
  }

  function change(key, value) { setForm((previous) => ({ ...previous, [key]: value })); setError('') }

  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim() || (kind === 'handbook' && !form.process.trim())) {
      setError(text('Bitte Titel und erforderliche Felder ausfüllen.', 'Please complete the title and required fields.'))
      return
    }
    if (kind === 'topic' && form.startDate && form.dueDate && form.startDate > form.dueDate) {
      setError(text('Der Zieltermin darf nicht vor dem Beginn liegen.', 'The due date must not precede the start date.'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await saveQualityRecord(kind, record, form)
      onSaved(saved)
    } catch (failure) {
      setConflict(failure.code === 'functions/aborted' || failure.code === 'functions/already-exists')
      setError(failure.code === 'functions/aborted' || failure.code === 'functions/already-exists'
        ? text('Der Eintrag wurde zwischenzeitlich geändert oder bereits gespeichert. Deine Eingaben bleiben erhalten. Kopiere sie bei Bedarf und öffne den Eintrag nach dem Schließen erneut.', 'This entry has changed or was already saved. Your input is preserved. Copy it if needed, then close and reopen the entry.')
        : text('Speichern fehlgeschlagen. Bitte Eingaben, Berechtigung und Verbindung prüfen und erneut versuchen.', 'Saving failed. Check your input, permissions and connection, then retry.'))
    } finally { setSaving(false) }
  }

  async function showHistory() {
    setHistoryLoading(true)
    try { setHistory(await listQualityHistory(kind, record.id)); setError('') }
    catch { setError(text('Der Verlauf konnte nicht geladen werden. Bitte erneut versuchen.', 'History could not be loaded. Please retry.')) }
    finally { setHistoryLoading(false) }
  }

  function field(key, rows = 4) {
    const date = ['date', 'startDate', 'dueDate'].includes(key)
    const short = ['title', 'process', 'owner', 'participants'].includes(key)
    return <label className="form-field" key={key}><span>{labels[key][en ? 1 : 0]}</span>{date || short
      ? <input type={date ? 'date' : 'text'} required={key === 'title' || key === 'date' || key === 'process'} maxLength={short ? (key === 'title' ? 200 : key === 'participants' ? 20000 : 500) : undefined} readOnly={readOnly} value={displayed[key] || ''} onChange={(event) => change(key, event.target.value)} />
      : <textarea name={key} rows={rows} maxLength={20000} readOnly={readOnly} value={displayed[key] || ''} onChange={(event) => change(key, event.target.value)} />}</label>
  }

  return <dialog ref={dialog} className="quality-dialog" aria-labelledby="quality-editor-title" onCancel={(event) => { event.preventDefault(); close() }}>
    <header className="quality-heading"><h2 id="quality-editor-title">{record.title || text(kind === 'topic' ? 'Neues Problem' : kind === 'meeting' ? 'Neue Besprechung' : 'Neuer Handbucheintrag', kind === 'topic' ? 'New problem' : kind === 'meeting' ? 'New meeting' : 'New handbook entry')}{kind === 'topic' && <small className="quality-editor-cycle">{text('PDCA-Durchlauf', 'PDCA cycle')} {form.cycle}{newCycle ? text(' · neu', ' · new') : ''}</small>}</h2><button className="button button--secondary" type="button" onClick={close} disabled={saving}>{text('Schließen', 'Close')}</button></header>
    {discard && <div className="quality-discard" role="alert"><p>{text('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}</p><button className="button button--secondary" type="button" onClick={() => setDiscard(false)}>{text('Weiter bearbeiten', 'Keep editing')}</button> <button className="button button--danger" type="button" onClick={() => onClose({ reload: conflict })}>{text('Verwerfen und schließen', 'Discard and close')}</button></div>}
    {record.revision > 0 && <div className="quality-history"><button className="button button--secondary" type="button" disabled={historyLoading} onClick={showHistory}>{text('Verlauf', 'History')}</button>{history && <label>{text('Fassung', 'Revision')} <select value={historical?.revision || ''} onChange={(event) => setHistorical(history.find((item) => String(item.revision) === event.target.value) || null)}><option value="">{text('Aktuelle Bearbeitung', 'Current editing')}</option>{history.map((item) => <option key={item.revision} value={item.revision}>{kind === 'topic' ? `${text('Durchlauf', 'Cycle')} ${item.cycle} · ` : ''}{text('Fassung', 'Revision')} {item.revision} · {item.updatedAt?.toDate?.().toLocaleString(en ? 'en-GB' : 'de-DE')} · {item.updatedByName || item.updatedBy || ''}</option>)}</select></label>}</div>}
    {historical && <p role="status">{text('Frühere Fassung · nur lesbar', 'Previous revision · read only')}</p>}
    <form onSubmit={submit}>
      <fieldset disabled={saving} className="quality-fields">
        {field('title')}
        {kind === 'topic' && <>
          <div className="quality-inline"><label className="form-field"><span>Status</span><select disabled={readOnly} value={displayed.status} onChange={(event) => change('status', event.target.value)}><option value="active">{text('Aktiv', 'Active')}</option><option value="paused">{text('Pausiert', 'Paused')}</option><option value="completed">{text('Abgeschlossen', 'Completed')}</option></select></label></div>
          {field('plan', 3)}{field('goal')}{field('measure')}
          <div className="quality-inline">{field('owner')}{field('startDate')}{field('dueDate')}</div>
          {PHASES.slice(1).map((phase) => field(phase, 3))}
        </>}
        {kind === 'handbook' && HANDBOOK_FIELDS.slice(1).map((key) => field(key, 3))}
        {kind === 'meeting' && <>{MEETING_FIELDS.slice(1).map((key) => field(key, 6))}<fieldset className="quality-topic-picker"><legend>{text('Besprochene Probleme', 'Problems discussed')}</legend>{topics.length === 0 && <p>{text('Lege zuerst ein Problem an.', 'Create a problem first.')}</p>}{topics.map((topic) => <label key={topic.id}><input type="checkbox" disabled={readOnly} checked={(displayed.topicIds || []).includes(topic.id)} onChange={(event) => change('topicIds', event.target.checked ? [...form.topicIds, topic.id] : form.topicIds.filter((id) => id !== topic.id))} /> {topic.title}</label>)}</fieldset></>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="quality-actions">{!readOnly && <button className="button" disabled={saving || !dirty} type="submit">{saving ? text('Wird gespeichert …', 'Saving …') : text('Speichern', 'Save')}</button>}</footer>
    </form>
  </dialog>
}

