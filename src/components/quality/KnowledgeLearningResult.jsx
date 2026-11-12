import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiCheck, FiEdit2 } from 'react-icons/fi'
import { buildKnowledgeLearningDiff, KNOWLEDGE_LEARNING_TEXT_FIELDS } from '../../lib/knowledgeLearningDiff.js'
import { knowledgeLabels, knowledgeUrl } from '../../lib/knowledgePresentation.js'
import KnowledgeDialog from './KnowledgeDialog.jsx'
import QualityTextarea from './QualityTextarea.jsx'
import '../../styles/knowledgeLearningResult.css'

export default function KnowledgeLearningResult({ run, currentArticle, language, canApply, busy, error, onApply, onDiscard, onClose }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const [initial] = useState(() => ({ runId: run.id || run.runId, values: Object.fromEntries(KNOWLEDGE_LEARNING_TEXT_FIELDS.map((key) => [key, run.proposal?.[key] || ''])) }))
  const [draft, setDraft] = useState(initial.values)
  const [editing, setEditing] = useState({})
  const [confirmClose, setConfirmClose] = useState(false)
  const [validation, setValidation] = useState('')
  const stale = initial.runId !== (run.id || run.runId)
  const ready = run?.status === 'ready'
  const dirty = ready && KNOWLEDGE_LEARNING_TEXT_FIELDS.some((key) => draft[key] !== initial.values[key])
  const comparison = useMemo(() => buildKnowledgeLearningDiff(ready ? { ...run, proposal: { ...run.proposal, ...draft } } : run, currentArticle), [run, currentArticle, draft, ready])
  const editable = ready && canApply && !comparison.missingBase && !stale
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const appliedId = run?.appliedResult?.id || (run?.status === 'applied' ? run.targetArticleId : '')
  const label = (key) => key === 'ruleIds' ? text('Grundregeln', 'Ground rules') : knowledgeLabels[key]?.[en ? 1 : 0] || key
  function displayPart(field, value) { return field.key === 'status' && knowledgeLabels[value] ? label(value) : value }
  useEffect(() => {
    if (!dirty) return undefined
    const prevent = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  function close() { if (busy) return; if (dirty) setConfirmClose(true); else onClose() }
  function apply() {
    if (!editable || busy) return
    if (!draft.title.trim() || !draft.process.trim()) { setValidation(text('Titel und Prozess ausfüllen.', 'Enter a title and process.')); setEditing((previous) => ({ ...previous, title: true, process: true })); return }
    if (comparison.baseArticle?.status === 'valid' && (!draft.situation.trim() || !draft.action.trim())) { setValidation(text('Für einen gültigen Artikel Situation und Vorgehen ausfüllen.', 'A valid article requires situation and steps.')); setEditing((previous) => ({ ...previous, situation: true, action: true })); return }
    setValidation('')
    onApply(draft)
  }
  return <KnowledgeDialog title={text('Lernergebnis', 'Learning result')} large onClose={close}>
    {confirmClose && <div className="quality-discard" role="alert"><p>{text('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}</p><button type="button" className="button button--secondary" onClick={() => setConfirmClose(false)}>{text('Weiter bearbeiten', 'Keep editing')}</button> <button type="button" className="button button--danger" onClick={onClose}>{text('Änderungen verwerfen', 'Discard changes')}</button></div>}
    {stale && ready && <p className="form-error" role="alert">{text('Ein neueres Lernergebnis liegt vor. Eingaben bei Bedarf kopieren und das Fenster erneut öffnen.', 'A newer learning result is available. Copy your changes if needed and reopen this window.')}</p>}
    <div className="knowledge-result-legend" aria-label={text('Legende', 'Legend')}><span className="knowledge-result-before">{text('Bisher', 'Previous')}</span><span aria-hidden="true"> / </span><span className="knowledge-result-ai">{dirty ? text('Vorschlag · bearbeitet', 'Edited proposal') : run.appliedValues ? text('Übernommener Vorschlag', 'Applied proposal') : text('KI-Vorschlag', 'AI proposal')}</span></div>
    {comparison.missingBase && <p className="form-error" role="alert">{text('Die Vergleichsbasis dieser Auswertung ist nicht verfügbar. Der KI-Vorschlag wird angezeigt; eine Übernahme ist hier nicht möglich.', 'The baseline for this analysis is unavailable. The AI proposal is shown; it cannot be applied here.')}</p>}
    {!comparison.proposal ? <p role="status">{text('Kein Lernergebnis verfügbar.', 'No learning result available.')}</p> : <>
      {!comparison.missingBase && !comparison.hasChanges && <p className="knowledge-result-empty" role="status">{text('Keine neuen Erkenntnisse', 'No new insights')}</p>}
      <div className="knowledge-result-fields">{comparison.fields.map((field) => <section key={field.key} className={`knowledge-result-field${field.key === 'title' || KNOWLEDGE_LEARNING_TEXT_FIELDS.includes(field.key) && !['process', 'topic', 'tags'].includes(field.key) ? ' knowledge-result-field--wide' : ''}${field.changed ? ' knowledge-result-field--changed' : ''}`}>
        <h3>{label(field.key)}{field.changed && field.before && !field.after && <small>{text('Entfällt', 'Removed')}</small>}{editable && KNOWLEDGE_LEARNING_TEXT_FIELDS.includes(field.key) && <button type="button" className="quality-phase-edit knowledge-result-edit" disabled={Boolean(busy)} aria-label={`${label(field.key)} ${editing[field.key] ? text('fertig', 'done') : text('bearbeiten', 'edit')}`} title={editing[field.key] ? text('Fertig', 'Done') : text('Bearbeiten', 'Edit')} onClick={() => setEditing((previous) => ({ ...previous, [field.key]: !previous[field.key] }))}>{editing[field.key] ? <FiCheck /> : <FiEdit2 />}</button>}</h3>
        {editable && editing[field.key] ? ['title', 'process', 'topic', 'tags'].includes(field.key) ? <input autoFocus className="knowledge-result-input" aria-label={label(field.key)} value={draft[field.key]} required={field.key === 'title' || field.key === 'process'} maxLength={field.key === 'title' ? 200 : field.key === 'tags' ? 2000 : 500} disabled={Boolean(busy)} onChange={(event) => { setDraft((previous) => ({ ...previous, [field.key]: event.target.value })); setValidation('') }} /> : <QualityTextarea autoFocus className="knowledge-result-input" aria-label={label(field.key)} rows={8} maxLength={20000} value={draft[field.key]} disabled={Boolean(busy)} onChange={(event) => { setDraft((previous) => ({ ...previous, [field.key]: event.target.value })); setValidation('') }} /> : <div className="knowledge-result-text">{comparison.missingBase ? field.after ? <span className="knowledge-result-ai">{displayPart(field, field.after)}</span> : <span className="knowledge-result-before">—</span> : !field.parts.length ? <span className="knowledge-result-before">—</span> : field.parts.map((part, index) => part.type === 'added' ? <ins key={index} className="knowledge-result-added"><span className="sr-only">{text(dirty || run.appliedValues ? 'Vorschlag: ' : 'KI-Vorschlag: ', dirty || run.appliedValues ? 'Proposal: ' : 'AI proposal: ')}</span>{displayPart(field, part.text)}</ins> : part.type === 'removed' ? <del key={index} className="knowledge-result-removed" title={text('Entfernt', 'Removed')}><span className="sr-only">{text('Entfernt: ', 'Removed: ')}</span>{displayPart(field, part.text)}</del> : <span key={index} className="knowledge-result-before">{displayPart(field, part.text)}</span>)}</div>}
      </section>)}</div>
    </>}
    {run?.insights && Object.values(run.insights).some((value) => value?.trim()) && <details className="knowledge-result-notes"><summary>{text('Hinweise der KI', 'AI notes')}</summary>{[['conflicts', text('Widersprüche', 'Conflicts')], ['openQuestions', text('Offene Fragen', 'Open questions')], ['variants', text('Varianten', 'Variants')]].filter(([key]) => run.insights[key]?.trim()).map(([key, label]) => <section key={key}><h3>{label}</h3><p className="quality-protocol">{run.insights[key]}</p></section>)}</details>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {validation && <p className="form-error" role="alert">{validation}</p>}
    <footer className="quality-actions knowledge-result-actions">{run?.status === 'ready' && canApply && onDiscard && (confirmDiscard ? <><span>{text('Lernergebnis verwerfen? Mails bleiben verfügbar.', 'Discard this result? Mails remain available.')}</span><button type="button" className="button button--secondary" disabled={Boolean(busy)} onClick={() => setConfirmDiscard(false)}>{text('Abbrechen', 'Cancel')}</button><button type="button" className="button button--danger" disabled={Boolean(busy)} onClick={onDiscard}>{busy ? text('Wird verworfen …', 'Discarding …') : text('Verwerfen', 'Discard')}</button></> : <button type="button" className="button button--secondary" disabled={Boolean(busy)} onClick={() => setConfirmDiscard(true)}>{text('Lernergebnis verwerfen', 'Discard learning result')}</button>)}{!confirmDiscard && editable && (comparison.hasChanges || dirty) && <button type="button" className="button button--ai" disabled={Boolean(busy)} onClick={apply}>{busy ? text('Wird übernommen …', 'Applying …') : text('Ins Handbuch übernehmen', 'Apply to handbook')}</button>}{run?.status === 'applied' && <p className="knowledge-result-applied" role="status">{text('Übernommen', 'Applied')}{appliedId && <> · <Link to={knowledgeUrl('article', appliedId)}>{text('Artikel öffnen', 'Open article')}</Link></>}</p>}</footer>
  </KnowledgeDialog>
}
