import { useEffect, useRef, useState } from 'react'
import { listQualityHistory, listQualityHandbookCatalog, saveQualityRecord } from '../../lib/quality.js'
import { HANDBOOK_SECTIONS, SMART_FIELDS, qualityValues, nextQualityCycle } from '../../lib/qualityPresentation.js'
import { qualityLabels as labels } from '../../lib/qualityLabels.js'
import QualityTextarea from './QualityTextarea.jsx'

export default function QualityEditor({ kind, record, departmentId, departments, handbookEntries, topics, focusPhase, newCycle = false, editable, onClose, onSaved, language }) {
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
  const [chapterEntries, setChapterEntries] = useState(handbookEntries || [])
  const [chapterError, setChapterError] = useState(false)
  const [chapterRetry, setChapterRetry] = useState(0)
  const dialog = useRef(null)
  const [initial] = useState(() => JSON.stringify(qualityValues(kind, record, departmentId)))
  const dirty = JSON.stringify(form) !== initial
  const readOnly = !editable || Boolean(historical)
  const displayed = historical || form
  const creatingTopic = kind === 'topic' && !record.revision && !newCycle
  const creatingMeeting = kind === 'meeting' && !record.revision
  const meetingFields = creatingMeeting ? ['title', 'date'] : focusPhase === 'notes' ? ['notes'] : focusPhase === 'participants' ? ['participants'] : focusPhase === 'topics' ? [] : ['title', 'date']
  const meetingHeading = creatingMeeting ? text('Neue Besprechung', 'New meeting') : focusPhase === 'notes' ? text('Protokoll', 'Minutes') : focusPhase === 'participants' ? text('Teilnehmer', 'Participants') : focusPhase === 'topics' ? text('Themen', 'Topics') : text('Besprechung bearbeiten', 'Edit meeting')
  const creatingHandbook = kind === 'handbook' && !record.revision
  const handbookFields = !creatingHandbook && HANDBOOK_SECTIONS.includes(focusPhase) ? [focusPhase] : focusPhase === 'review' ? ['owner', 'lastReviewedDate', 'nextReviewDate'] : ['title', 'process']
  const handbookHeading = creatingHandbook ? text('Neuer Artikel', 'New article') : HANDBOOK_SECTIONS.includes(focusPhase) ? labels[focusPhase][en ? 1 : 0] : focusPhase === 'review' ? text('Zuständigkeit & Kontrolle', 'Responsibility & review') : text('Artikel bearbeiten', 'Edit article')
  const chapters = [...new Set(chapterEntries.filter((item) => item.departmentId === form.departmentId).map((item) => item.process))].sort((left, right) => left.localeCompare(right))
  const phaseFields = { plan: ['plan'], smart: SMART_FIELDS.map(({ key }) => key), cycle: ['cycleStartDate'], do: ['do', 'owner', 'startDate', 'dueDate'], check: ['check'], act: ['actDecision', 'actDate', 'act'] }
  const topicFields = creatingTopic ? ['title', 'plan'] : newCycle ? phaseFields.cycle : phaseFields[focusPhase] || ['title', 'status']
  const topicHeading = creatingTopic ? text('Neues Thema', 'New topic') : newCycle ? text('Neuer Durchlauf', 'New cycle') : focusPhase === 'smart' ? text('SMART-Ziel', 'SMART goal') : focusPhase === 'cycle' ? text('Zyklusstart', 'Cycle start') : focusPhase ? text('Bearbeiten', 'Edit') + ' · ' + focusPhase.toUpperCase() : text('Thema bearbeiten', 'Edit topic')

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

  useEffect(() => {
    if (kind !== 'handbook' || focusPhase || handbookEntries) return undefined
    let active = true
    listQualityHandbookCatalog().then((items) => { if (active) { setChapterEntries(items); setChapterError(false) } }).catch(() => { if (active) setChapterError(true) })
    return () => { active = false }
  }, [kind, focusPhase, handbookEntries, chapterRetry])

  function close() {
    if (saving) return
    if (dirty) setDiscard(true)
    else onClose({ reload: conflict })
  }

  function change(key, value) { setForm((previous) => ({ ...previous, [key]: value })); setError('') }

  async function submit(event) {
    event.preventDefault()
    if (readOnly || saving) return
    if (!form.title.trim() || (kind === 'handbook' && !form.process.trim())) {
      setError(text('Bitte Titel und erforderliche Felder ausfüllen.', 'Please complete the title and required fields.'))
      return
    }
    if (kind === 'topic' && form.startDate && form.dueDate && form.startDate > form.dueDate) {
      setError(text('Der Zieltermin darf nicht vor dem Beginn liegen.', 'The due date must not precede the start date.'))
      return
    }
    if (kind === 'handbook' && form.lastReviewedDate && form.nextReviewDate && form.nextReviewDate < form.lastReviewedDate) {
      setError(text('Die nächste Kontrolle darf nicht vor der letzten Kontrolle liegen.', 'The next review must not precede the last review.'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const values = kind === 'topic' ? { ...form, goal: form.smartSpecific, measure: form.smartMeasurable } : form
      const saved = await saveQualityRecord(kind, record, values)
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

  function field(key, rows = 3) {
    if (kind === 'handbook' && key === 'process') return <label className="form-field" key={key}><span>{text('Kapitel', 'Chapter')}</span><input required maxLength={500} list={readOnly ? undefined : 'quality-chapters'} placeholder={text('Auswählen oder neu eingeben', 'Select or enter a new chapter')} readOnly={readOnly} value={displayed.process || ''} onChange={(event) => change(key, event.target.value)} /><datalist id="quality-chapters">{chapters.map((chapter) => <option key={chapter} value={chapter} />)}</datalist></label>
    if (key === 'actDecision') return <label className="form-field" key={key}><span>{labels[key][en ? 1 : 0]}</span><select disabled={readOnly} value={displayed.actDecision || ''} onChange={(event) => change(key, event.target.value)}><option value="">—</option><option value="correct">{text('Korrigieren', 'Correct')}</option><option value="discard">{text('Verwerfen', 'Discard')}</option><option value="establish">{text('Etablieren', 'Standardize')}</option></select></label>
    if (key === 'status') return <label className="form-field" key={key}><span>Status</span><select disabled={readOnly} value={displayed.status} onChange={(event) => change('status', event.target.value)}><option value="active">{text('Aktiv', 'Active')}</option><option value="paused">{text('Pausiert', 'Paused')}</option><option value="completed">{text('Abgeschlossen', 'Completed')}</option></select></label>
    const label = creatingTopic && key === 'plan' ? text('Kurzbeschreibung (optional)', 'Short description (optional)') : labels[key][en ? 1 : 0]
    const date = ['date', 'startDate', 'dueDate', 'cycleStartDate', 'actDate', 'lastReviewedDate', 'nextReviewDate'].includes(key)
    const smart = key.startsWith('smart')
    const short = smart || ['title', 'process', 'owner', 'participants'].includes(key)
    return <label className="form-field" key={key}><span>{label}</span>{date || short
      ? <input type={date ? 'date' : 'text'} required={key === 'title' || key === 'date' || key === 'process'} maxLength={short ? (key === 'title' ? 200 : key === 'participants' ? 20000 : smart ? (['smartSpecific', 'smartMeasurable'].includes(key) ? 20000 : 2000) : 500) : undefined} readOnly={readOnly} value={displayed[key] || ''} onChange={(event) => change(key, event.target.value)} />
      : <QualityTextarea name={key} rows={rows} maxLength={20000} readOnly={readOnly} value={displayed[key] || ''} onChange={(event) => change(key, event.target.value)} />}</label>
  }

  return <dialog ref={dialog} className={`quality-dialog quality-dialog--editor${kind === 'handbook' ? ' quality-dialog--handbook' : ''}${creatingTopic || creatingMeeting || creatingHandbook ? ' quality-dialog--create' : ''}`} aria-labelledby="quality-editor-title" onCancel={(event) => { event.preventDefault(); close() }}>
    <header className="quality-heading"><h2 id="quality-editor-title">{kind === 'topic' ? topicHeading : kind === 'handbook' ? handbookHeading : meetingHeading}{kind === 'topic' && !creatingTopic && <small className="quality-editor-cycle">{text('Durchlauf', 'Cycle')} {form.cycle}</small>}</h2><button className="button button--secondary" type="button" onClick={close} disabled={saving}>{text('Schließen', 'Close')}</button></header>
    {discard && <div className="quality-discard" role="alert"><p>{text('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}</p><button className="button button--secondary" type="button" onClick={() => setDiscard(false)}>{text('Weiter bearbeiten', 'Keep editing')}</button> <button className="button button--danger" type="button" onClick={() => onClose({ reload: conflict })}>{text('Verwerfen und schließen', 'Discard and close')}</button></div>}
    {kind !== 'handbook' && record.revision > 0 && <div className="quality-history"><button className="button button--secondary" type="button" disabled={historyLoading} onClick={showHistory}>{text('Verlauf', 'History')}</button>{history && <label>{text('Fassung', 'Revision')} <select value={historical?.revision || ''} onChange={(event) => setHistorical(history.find((item) => String(item.revision) === event.target.value) || null)}><option value="">{text('Aktuelle Bearbeitung', 'Current editing')}</option>{history.map((item) => <option key={item.revision} value={item.revision}>{kind === 'topic' ? `${text('Durchlauf', 'Cycle')} ${item.cycle} · ` : ''}{text('Fassung', 'Revision')} {item.revision} · {item.updatedAt?.toDate?.().toLocaleString(en ? 'en-GB' : 'de-DE')} · {item.updatedByName || item.updatedBy || ''}</option>)}</select></label>}</div>}
    {historical && <p role="status">{text('Frühere Fassung · nur lesbar', 'Previous revision · read only')}</p>}
    {chapterError && <p className="form-error" role="alert">{text('Kapitelvorschläge konnten nicht geladen werden.', 'Chapter suggestions could not be loaded.')} <button type="button" className="button button--secondary" onClick={() => setChapterRetry((value) => value + 1)}>{text('Erneut versuchen', 'Retry')}</button></p>}
    <form onSubmit={submit}>
      <fieldset disabled={saving} className={`quality-fields${focusPhase === 'smart' ? ' quality-fields--smart' : ''}`}>
        {creatingHandbook && departments && <label className="form-field"><span>{text('Abteilung', 'Department')}</span><select required value={form.departmentId} onChange={(event) => change('departmentId', event.target.value)}>{departments.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {kind === 'meeting' && meetingFields.map((key) => field(key, key === 'notes' ? 12 : 3))}
        {kind === 'topic' && topicFields.map((key) => field(key, creatingTopic ? 3 : 12))}
        {kind === 'handbook' && handbookFields.map((key) => field(key, HANDBOOK_SECTIONS.includes(key) ? 12 : 3))}
        {kind === 'meeting' && !creatingMeeting && focusPhase === 'topics' && <><fieldset className="quality-topic-picker"><legend>{text('Besprochene Themen', 'Topics discussed')}</legend>{topics.length === 0 && <p>{text('Lege zuerst ein Thema an.', 'Create a topic first.')}</p>}{topics.map((topic) => <label key={topic.id}><input type="checkbox" disabled={readOnly} checked={(displayed.topicIds || []).includes(topic.id)} onChange={(event) => change('topicIds', event.target.checked ? [...form.topicIds, topic.id] : form.topicIds.filter((id) => id !== topic.id))} /> {topic.title}</label>)}</fieldset></>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="quality-actions">{!readOnly && <button className="button" disabled={saving || !dirty} type="submit">{saving ? text('Wird gespeichert …', 'Saving …') : creatingTopic || creatingHandbook || creatingMeeting ? text('Anlegen und öffnen', 'Create and open') : text('Speichern', 'Save')}</button>}</footer>
    </form>
  </dialog>
}

