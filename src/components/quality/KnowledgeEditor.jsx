import { useEffect, useState } from 'react'
import { saveKnowledge } from '../../lib/knowledge.js'
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_STATUSES, knowledgeLabels, knowledgeSections, knowledgeValues } from '../../lib/knowledgePresentation.js'
import QualityTextarea from './QualityTextarea.jsx'
import KnowledgeDialog from './KnowledgeDialog.jsx'

export default function KnowledgeEditor({ kind, record, section, rules = [], articles = [], language, onClose, onSaved }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const label = (key) => knowledgeLabels[key]?.[en ? 1 : 0] || key
  const [form, setForm] = useState(() => knowledgeValues(kind, record))
  const [initial] = useState(() => JSON.stringify(knowledgeValues(kind, record)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)
  const [conflict, setConflict] = useState(false)
  const dirty = JSON.stringify(form) !== initial
  const creating = !record.revision
  const keys = creating ? kind === 'rule' ? ['title', 'audience'] : ['title', 'process'] : section === 'metadata' ? kind === 'rule' ? ['title', 'audience'] : ['title', 'process', 'topic', 'tags'] : section === 'review' ? ['owner', 'status', 'lastReviewedDate', 'nextReviewDate'] : section === 'rules' ? [] : [section]
  const title = creating ? text(kind === 'rule' ? 'Neue Grundregel' : 'Neuer Artikel', kind === 'rule' ? 'New ground rule' : 'New article') : section === 'metadata' ? text('Bearbeiten', 'Edit') : section === 'review' ? text('Stand & Kontrolle', 'Status & review') : section === 'rules' ? text('Grundregeln zuordnen', 'Link ground rules') : label(section)
  useEffect(() => {
    if (!dirty) return undefined
    const prevent = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  function close() { if (saving) return; if (dirty) setDiscard(true); else onClose({ reload: conflict }) }
  function change(key, value) { setForm((previous) => ({ ...previous, [key]: value })); setError('') }
  async function submit(event) {
    event.preventDefault()
    if (saving) return
    if (form.status === 'valid' && (kind === 'article' ? !form.situation.trim() || !form.action.trim() : !form.scope.trim() || !form.provisions.trim())) { setError(text('Für „Gültig“ bitte Situation und Vorgehen bzw. Geltungsbereich und Vorgaben ausfüllen.', 'To mark valid, complete situation and steps, or scope and requirements.')); return }
    if (kind === 'article' && form.status === 'valid' && form.ruleIds.some((id) => rules.find((rule) => rule.id === id)?.status !== 'valid')) { setError(text('Verknüpfte Grundregeln zuerst gültig setzen oder ihre Zuordnung entfernen.', 'Validate linked ground rules first or remove their links.')); return }
    if (form.lastReviewedDate && form.nextReviewDate && form.nextReviewDate < form.lastReviewedDate) { setError(text('Die nächste Prüfung darf nicht vor der letzten liegen.', 'The next review must not precede the last.')); return }
    setSaving(true)
    try { onSaved(await saveKnowledge(kind, record, form)) }
    catch (failure) { setConflict(failure.code === 'functions/aborted'); setError(failure.code === 'functions/aborted' ? text('Inzwischen geändert. Eingaben bei Bedarf kopieren. Nach dem Schließen wird neu geladen.', 'Changed by another user. Copy your input if needed. Closing will reload the entry.') : text('Speichern fehlgeschlagen. Eingaben, Verbindung und Berechtigung prüfen.', 'Saving failed. Check input, connection and permissions.')) }
    finally { setSaving(false) }
  }
  return <KnowledgeDialog title={title} onClose={close}>
    {discard && <div className="quality-discard" role="alert"><p>{text('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}</p><button type="button" className="button button--secondary" onClick={() => setDiscard(false)}>{text('Weiter bearbeiten', 'Keep editing')}</button> <button type="button" className="button button--danger" onClick={() => onClose({ reload: conflict })}>{text('Verwerfen', 'Discard')}</button></div>}
    <form onSubmit={submit}><fieldset disabled={saving} className="quality-fields">{keys.map((key) => <label className="form-field" key={key}><span>{label(key)}</span>{['status', 'audience'].includes(key) ? <select value={form[key]} onChange={(event) => change(key, event.target.value)}>{(key === 'status' ? KNOWLEDGE_STATUSES : KNOWLEDGE_AUDIENCES).map((value) => <option key={value} value={value}>{label(value)}</option>)}</select> : knowledgeSections(kind).includes(key) ? <QualityTextarea name={key} rows={14} maxLength={20000} value={form[key]} onChange={(event) => change(key, event.target.value)} /> : <input type={key.endsWith('Date') ? 'date' : 'text'} value={form[key]} required={key === 'title' || key === 'process'} maxLength={key === 'title' ? 200 : key === 'tags' ? 2000 : 500} list={key === 'process' ? 'knowledge-processes' : undefined} onChange={(event) => change(key, event.target.value)} />}</label>)}
      {keys.includes('process') && <datalist id="knowledge-processes">{[...new Set(articles.map((item) => item.process).filter(Boolean))].sort().map((process) => <option key={process} value={process} />)}</datalist>}
      {section === 'rules' && <div className="knowledge-rule-picker">{rules.length === 0 && <p>{text('Noch keine Grundregeln.', 'No ground rules yet.')}</p>}{rules.map((rule) => <label key={rule.id}><input type="checkbox" checked={form.ruleIds.includes(rule.id)} onChange={(event) => change('ruleIds', event.target.checked ? [...form.ruleIds, rule.id] : form.ruleIds.filter((id) => id !== rule.id))} /> {rule.title} <small>{label(rule.status)}</small></label>)}</div>}
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}<footer className="quality-actions"><button className="button" type="submit" disabled={saving || (!creating && !dirty)}>{saving ? text('Wird gespeichert …', 'Saving …') : creating ? text('Anlegen und öffnen', 'Create and open') : text('Speichern', 'Save')}</button></footer></form>
  </KnowledgeDialog>
}
