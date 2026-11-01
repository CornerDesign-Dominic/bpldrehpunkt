import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { applyKnowledgeLearning, manageKnowledgeCase } from '../../lib/knowledge.js'
import { knowledgeCaseAnswer, knowledgeCasePending, knowledgeCaseSelection } from '../../lib/knowledgeCases.js'
import { KNOWLEDGE_ARTICLE_SECTIONS, knowledgeLabels, knowledgeUrl } from '../../lib/knowledgePresentation.js'
import { buildKnowledgeLearningDiff } from '../../lib/knowledgeLearningDiff.js'
import { knowledgeLearningError } from '../../lib/useKnowledgeLearningWork.js'
import KnowledgeLearningResult from './KnowledgeLearningResult.jsx'
import KnowledgeDialog from './KnowledgeDialog.jsx'

const roleLabels = { unknown: ['Unbekannt', 'Unknown'], internal: ['Intern', 'Internal'], customer: ['Kunde', 'Customer'], carrier: ['Unternehmer', 'Carrier'], tax: ['Finanzamt', 'Tax office'], lawyer: ['Anwalt', 'Lawyer'], collection: ['Inkasso', 'Debt collection'], other: ['Sonstige', 'Other'] }
const dateTime = (value, en) => value?.toDate?.().toLocaleString(en ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) || '—'

export function KnowledgeBrain({ pending, empty = false, language }) {
  const label = empty ? language === 'en' ? 'No cases' : 'Keine Fälle' : pending ? language === 'en' ? 'Not yet analyzed' : 'Noch nicht ausgewertet' : language === 'en' ? 'Analyzed' : 'Ausgewertet'
  return <span className={`knowledge-brain${empty ? ' knowledge-brain--empty' : pending ? ' knowledge-brain--pending' : ' knowledge-brain--done'}`} role="img" aria-label={label} title={label}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 5c-1-4-7-3-7 1-4 0-5 6-2 8-1 4 3 7 6 5 1 2 3 1 3-1V5Zm0 0c1-4 7-3 7 1 4 0 5 6 2 8 1 4-3 7-6 5-1 2-3 1-3-1V5Z"/><path d="M5 6c0 3 3 2 3 5M3 14c3-2 6-1 6 2M19 6c0 3-3 2-3 5m5 3c-3-2-6-1-6 2"/></svg></span>
}

export default function KnowledgeCaseReview({ record, cases, groups, articles, handbookReadable, canManage, canLearn, language, onClose, run, onLearn }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const [selectedIds, setSelectedIds] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [target, setTarget] = useState(run?.targetArticleId || record.articleId || 'new')
  const [showResult, setShowResult] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [management, setManagement] = useState(null)
  const [appliedArticleId, setAppliedArticleId] = useState('')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const items = cases.filter((item) => item.removed !== true).sort((left, right) => (right.updatedAt?.toMillis?.() || 0) - (left.updatedAt?.toMillis?.() || 0))
  const page = Math.min(pageIndex, Math.max(0, Math.ceil(items.length / 20) - 1))
  const visible = items.slice(page * 20, page * 20 + 20)
  const selectable = (item) => Boolean(item.incomingText?.trim() && knowledgeCaseAnswer(item).text.trim())
  const selection = knowledgeCaseSelection(items, selectedIds)
  const incomplete = items.filter((item) => selectedIds.includes(item.id) && !selectable(item)).length
  const learning = run?.status === 'running'
  const locked = Boolean(busy) || learning
  const visibleSelectable = visible
  const allSelected = visibleSelectable.length > 0 && visibleSelectable.every((item) => selectedIds.includes(item.id))
  const currentArticleId = appliedArticleId || run?.appliedResult?.id || run?.targetArticleId || (target && target !== 'new' ? target : record.articleId)
  const currentArticle = handbookReadable ? articles.find((item) => item.id === currentArticleId) : null
  const comparison = run?.proposal ? buildKnowledgeLearningDiff(run, currentArticle) : null
  const previewFields = comparison?.fields.filter((field) => KNOWLEDGE_ARTICLE_SECTIONS.includes(field.key) && field.changed) || []
  function select(item, checked) {
    setError('')
    if (checked && !selectedIds.includes(item.id) && selection.length >= 20) { setError(text('Bitte höchstens 20 Fälle auswählen.', 'Select at most 20 cases.')); return }
    setSelectedIds((previous) => checked ? [...new Set([...previous, item.id])] : previous.filter((id) => id !== item.id))
  }
  function selectAll(checked) {
    const next = checked ? visibleSelectable.map((item) => item.id) : selectedIds.filter((id) => !visibleSelectable.some((item) => item.id === id))
    setSelectedIds(next)
    setError('')
  }
  function failure(error) { return knowledgeLearningError(error, en) }
  async function learn() {
    if (!canLearn || locked || !selection.length || incomplete || !target) return
    const targetArticle = target === 'new' ? null : articles.find((item) => item.id === target)
    if (target !== 'new' && !targetArticle) { setError(text('Zielartikel nicht verfügbar.', 'Target article unavailable.')); return }
    const values = { gapId: record.id, caseIds: selection, targetArticleId: targetArticle?.id || '', ...(targetArticle ? { expectedArticleRevision: targetArticle.revision } : {}) }
    setBusy('learn')
    setError('')
    try { await onLearn(values); if (active.current) setSelectedIds([]) }
    catch (error) { if (active.current) setError(failure(error)) }
    finally { if (active.current) setBusy('') }
  }
  async function apply() {
    if (!canLearn || busy || !run || run.status !== 'ready') return
    setBusy('apply')
    setError('')
    try {
      const result = await applyKnowledgeLearning({ runId: run.runId || run.id, expectedRevision: run.revision })
      if (active.current) { setAppliedArticleId(result.id) }
    } catch (error) { if (active.current) setError(failure(error)) }
    finally { if (active.current) setBusy('') }
  }
  async function manage(item) {
    if (!canManage || busy || !management) return
    const destination = management.target || ''
    if (management.action === 'move' && !destination) return
    const values = { id: item.id, expectedRevision: Number.isSafeInteger(item.caseRevision) && item.caseRevision > 0 ? item.caseRevision : 1, action: management.action }
    if (management.action === 'move') {
      const [kind, id] = [destination.slice(0, destination.indexOf(':')), destination.slice(destination.indexOf(':') + 1)]
      if (kind === 'article') values.articleId = id
      else values.gapId = id
    }
    setBusy('manage')
    setError('')
    try { await manageKnowledgeCase(values); if (active.current) { setManagement(null); setSelectedIds((previous) => previous.filter((id) => id !== item.id)) } }
    catch (error) { if (active.current) setError(failure(error)) }
    finally { if (active.current) setBusy('') }
  }
  const role = (value) => roleLabels[value]?.[en ? 1 : 0] || roleLabels.unknown[en ? 1 : 0]
  return <><KnowledgeDialog title={record.category === 'unassigned' || record.id === 'unassigned' ? text('Nicht zugeordnet', 'Unassigned') : record.title} large onClose={() => { if (!busy || busy === 'learn') onClose() }}>
    <div className="knowledge-case-toolbar"><span>{items.length} {text('Mails', 'mails')} · {items.filter(knowledgeCasePending).length} {text('ausstehend', 'pending')} · {items.filter((item) => !knowledgeCasePending(item)).length} {text('ausgewertet', 'analyzed')}</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="knowledge-review-grid">
      <div className="knowledge-case-pairs"><div className="knowledge-case-columns"><h3>{text('Eingang', 'Incoming')}</h3><h3>{text('Antwort', 'Reply')}</h3></div>
        {canLearn && <div className="knowledge-case-selection"><label><input type="checkbox" checked={allSelected} disabled={locked || !visibleSelectable.length} onChange={(event) => selectAll(event.target.checked)} /> {text('Alle sichtbaren auswählen', 'Select all visible')}</label><span>{selection.length}/20 {text('ausgewählt', 'selected')}</span></div>}
        {!items.length && <p>{text('Keine Fallkopien vorhanden.', 'No case copies available.')}</p>}
        {visible.map((item, index) => {
          const answer = knowledgeCaseAnswer(item)
          const answerLabel = answer.kind === 'accepted' ? text('Versand angenommen', 'Send accepted') : answer.kind === 'unknown' ? text('Versandstatus unklar', 'Send status unknown') : text('KI-Entwurf', 'AI draft')
          return <article key={item.id} className="knowledge-case-pair"><div className="knowledge-case-copy"><header><div className="knowledge-case-select">{canLearn && <input type="checkbox" aria-label={`${text('Mail', 'Mail')} ${page * 20 + index + 1} ${text('auswählen', 'select')}`} checked={selection.some((selected) => selected.id === item.id)} disabled={locked} onChange={(event) => select(item, event.target.checked)} />}<KnowledgeBrain pending={knowledgeCasePending(item)} language={language} /><strong>{role(item.senderRole)} → {role(item.recipientRole)}</strong></div><small>{dateTime(item.suggestionAt || item.updatedAt, en)}</small></header><p className="quality-protocol">{item.incomingText || text('Eingangstext fehlt · Lernen nicht möglich', 'Incoming text missing · cannot be used for learning')}</p></div>
            <div className="knowledge-case-copy"><header><strong>{role(item.recipientRole)} → {role(item.senderRole)}</strong><small>{answerLabel} · {dateTime(answer.kind === 'draft' ? item.suggestionAt : item.sentAt || item.updatedAt, en)}</small></header><p className="quality-protocol">{answer.text || text('Kein Antworttext hinterlegt.', 'No reply text recorded.')}</p></div>
            {canManage && <div className="knowledge-case-management">{management?.id === item.id ? management.action === 'remove' ? <><span>{text('Aus der Wissenssammlung löschen? Die Originalmail bleibt erhalten.', 'Delete from the knowledge collection? The original mail is kept.')}</span><button className="button button--danger" disabled={locked} onClick={() => void manage(item)}>{text('Löschen', 'Delete')}</button><button className="button button--secondary" disabled={locked} onClick={() => setManagement(null)}>{text('Abbrechen', 'Cancel')}</button></> : <><select aria-label={text('Verschieben nach', 'Move to')} value={management.target} disabled={locked} onChange={(event) => setManagement((previous) => ({ ...previous, target: event.target.value }))}><option value="">{text('Ziel wählen', 'Choose destination')}</option><option value="group:unassigned">{text('Nicht zugeordnet', 'Unassigned')}</option><optgroup label={text('Artikelvorschläge', 'Article suggestions')}>{groups.filter((group) => group.id !== record.id && group.id !== 'unassigned' && group.category !== 'article').map((group) => <option key={group.id} value={`group:${group.id}`}>{group.title}</option>)}</optgroup>{handbookReadable && <optgroup label={text('Handbuchartikel', 'Handbook articles')}>{articles.map((article) => <option key={article.id} value={`article:${article.id}`}>{article.title}</option>)}</optgroup>}</select><button className="button" disabled={locked || !management.target} onClick={() => void manage(item)}>{text('Verschieben', 'Move')}</button><button className="button button--secondary" disabled={locked} onClick={() => setManagement(null)}>{text('Abbrechen', 'Cancel')}</button></> : <><button className="button button--secondary" disabled={locked} onClick={() => setManagement({ id: item.id, action: 'move', target: '' })}>{text('Verschieben', 'Move')}</button><button className="button button--secondary" disabled={locked} onClick={() => setManagement({ id: item.id, action: 'remove' })}>{text('Löschen', 'Delete')}</button></>}</div>}
          </article>
        })}
        {items.length > 20 && <div className="knowledge-case-pagination"><button className="button button--secondary" disabled={page === 0 || Boolean(busy)} onClick={() => setPageIndex(page - 1)}>{text('Zurück', 'Previous')}</button><span>{page + 1}/{Math.ceil(items.length / 20)}</span><button className="button button--secondary" disabled={(page + 1) * 20 >= items.length || Boolean(busy)} onClick={() => setPageIndex(page + 1)}>{text('Weiter', 'Next')}</button></div>}
      </div>
      <aside className="knowledge-case-insights"><h3>{text('Lernen', 'Learning')}</h3>
        {currentArticle && <Link className="knowledge-current-link" to={knowledgeUrl('article', currentArticle.id)}>{text('Aktuellen Artikel öffnen', 'Open current article')} ↗</Link>}
        {canLearn && <div className="knowledge-learning-controls"><label className="form-field"><span>{text('Lernen für', 'Learn for')}</span><select value={target} disabled={locked} onChange={(event) => setTarget(event.target.value)}><option value="new">{text('Neuen Artikel', 'New article')}</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}</select></label><button className="button button--ai" disabled={locked || !selection.length || incomplete > 0 || !target} onClick={() => void learn()}>{learning || busy === 'learn' ? text('Lernen läuft …', 'Learning in progress …') : text('Lernen starten', 'Start learning')}</button></div>}
        {incomplete > 0 && <p className="knowledge-learning-notice" role="status">{text(`${incomplete} unvollständige Mail(s) vor dem Lernen abwählen.`, `Deselect ${incomplete} incomplete mail(s) before learning.`)}</p>}
        {(learning || busy === 'learn') && <p className="knowledge-learning-progress" role="status"><span className="knowledge-learning-spinner" aria-hidden="true" />{text('Läuft im Hintergrund. Fenster kann geschlossen werden.', 'Running in the background. You can close this window.')}</p>}
        {run?.status === 'failed' && !error && <p className="form-error" role="alert">{text('Lernen fehlgeschlagen. Bitte erneut starten.', 'Learning failed. Please start again.')}</p>}
        {comparison && <section className="knowledge-learning-proposal"><h4>{text('Ergebnis', 'Result')}{run.status === 'applied' ? ` · ${text('übernommen', 'applied')}` : ''}</h4>
          {comparison.missingBase ? <p className="knowledge-learning-notice">{text('Vergleichsbasis fehlt. Ergebnis öffnen.', 'Baseline unavailable. Open the result.')}</p> : !comparison.hasChanges && <p>{text('Keine neuen Erkenntnisse', 'No new insights')}</p>}
          {previewFields.map((field) => <section className="knowledge-learning-preview" key={field.key}><h4>{knowledgeLabels[field.key][en ? 1 : 0]}</h4><p className="quality-protocol">{field.parts.length ? field.parts.map((part, index) => part.type === 'removed' ? <del key={index}>{part.text}</del> : <span key={index} className={part.type === 'added' ? 'knowledge-preview-added' : ''}>{part.text}</span>) : field.after || '—'}</p></section>)}
          <button className="button button--secondary" onClick={() => setShowResult(true)}>{text('Ergebnis öffnen', 'Open result')}</button>
        </section>}
      </aside>
    </div>
  </KnowledgeDialog>{showResult && <KnowledgeLearningResult run={run} currentArticle={currentArticle} language={language} canApply={canLearn} busy={busy === 'apply'} error={error} onApply={() => void apply()} onClose={() => { if (busy !== 'apply') setShowResult(false) }} />}</>
}
