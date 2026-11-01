import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { applyKnowledgeLearning, learnKnowledgeCases, listKnowledgeLearningRuns, manageKnowledgeCase } from '../../lib/knowledge.js'
import { knowledgeCaseAnswer, knowledgeCasePending, knowledgeCaseSelection } from '../../lib/knowledgeCases.js'
import { KNOWLEDGE_ARTICLE_SECTIONS, knowledgeLabels, knowledgeUrl } from '../../lib/knowledgePresentation.js'
import KnowledgeDialog from './KnowledgeDialog.jsx'

const roleLabels = { unknown: ['Unbekannt', 'Unknown'], internal: ['Intern', 'Internal'], customer: ['Kunde', 'Customer'], carrier: ['Unternehmer', 'Carrier'], tax: ['Finanzamt', 'Tax office'], lawyer: ['Anwalt', 'Lawyer'], collection: ['Inkasso', 'Debt collection'], other: ['Sonstige', 'Other'] }
const dateTime = (value, en) => value?.toDate?.().toLocaleString(en ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) || '—'

export function KnowledgeBrain({ pending, empty = false, language }) {
  const label = empty ? language === 'en' ? 'No cases' : 'Keine Fälle' : pending ? language === 'en' ? 'Not yet analyzed' : 'Noch nicht ausgewertet' : language === 'en' ? 'Analyzed' : 'Ausgewertet'
  return <span className={`knowledge-brain${empty ? ' knowledge-brain--empty' : pending ? ' knowledge-brain--pending' : ' knowledge-brain--done'}`} role="img" aria-label={label} title={label}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 5c-1-4-7-3-7 1-4 0-5 6-2 8-1 4 3 7 6 5 1 2 3 1 3-1V5Zm0 0c1-4 7-3 7 1 4 0 5 6 2 8 1 4-3 7-6 5-1 2-3 1-3-1V5Z"/><path d="M5 6c0 3 3 2 3 5M3 14c3-2 6-1 6 2M19 6c0 3-3 2-3 5m5 3c-3-2-6-1-6 2"/></svg></span>
}

function ArticleText({ article, language }) {
  const index = language === 'en' ? 1 : 0
  return <article className="knowledge-proposal-article"><h3>{article.title}</h3><p className="quality-eyebrow">{[article.process, article.topic].filter(Boolean).join(' · ')}</p>{KNOWLEDGE_ARTICLE_SECTIONS.map((section) => <section key={section}><h4>{knowledgeLabels[section][index]}</h4><p className="quality-protocol">{article[section] || '—'}</p></section>)}</article>
}

export default function KnowledgeCaseReview({ record, cases, groups, articles, handbookReadable, canManage, canLearn, language, onClose, onRefresh }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const [selectedIds, setSelectedIds] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [target, setTarget] = useState(record.articleId || '')
  const [run, setRun] = useState(null)
  const [runsLoading, setRunsLoading] = useState(handbookReadable)
  const [runRetry, setRunRetry] = useState(0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [management, setManagement] = useState(null)
  const [appliedArticleId, setAppliedArticleId] = useState('')
  const attempt = useRef(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    if (!handbookReadable) return undefined
    let current = true
    listKnowledgeLearningRuns(record.id).then((items) => { if (current) { setRun(items[0] || null); setRunsLoading(false) } }).catch(() => { if (current) { setRunsLoading(false); setError(en ? 'Learning proposals could not be loaded.' : 'Lernvorschläge konnten nicht geladen werden.') } })
    return () => { current = false }
  }, [record.id, handbookReadable, runRetry, en])
  const items = cases.filter((item) => item.removed !== true).sort((left, right) => (right.updatedAt?.toMillis?.() || 0) - (left.updatedAt?.toMillis?.() || 0))
  const page = Math.min(pageIndex, Math.max(0, Math.ceil(items.length / 20) - 1))
  const visible = items.slice(page * 20, page * 20 + 20)
  const selectable = (item) => Boolean(item.incomingText?.trim() && knowledgeCaseAnswer(item).text.trim() && Number.isSafeInteger(item.caseRevision) && item.caseRevision > 0)
  const selection = knowledgeCaseSelection(items.filter(selectable), selectedIds)
  const visibleSelectable = visible.filter(selectable)
  const allSelected = visibleSelectable.length > 0 && visibleSelectable.every((item) => selectedIds.includes(item.id))
  const currentArticleId = appliedArticleId || run?.appliedResult?.id || run?.targetArticleId || (target && target !== 'new' ? target : record.articleId)
  const currentArticle = handbookReadable ? articles.find((item) => item.id === currentArticleId) : null
  const proposal = run?.proposal
  function select(item, checked) {
    setError('')
    if (checked && !selectedIds.includes(item.id) && selection.length >= 20) { setError(text('Bitte höchstens 20 Fälle auswählen.', 'Select at most 20 cases.')); return }
    setSelectedIds((previous) => checked ? [...new Set([...previous, item.id])] : previous.filter((id) => id !== item.id))
  }
  function selectAll(checked) {
    const next = checked ? [...new Set([...selection.map((item) => item.id), ...visibleSelectable.map((item) => item.id)])] : selectedIds.filter((id) => !visibleSelectable.some((item) => item.id === id))
    if (next.length > 20) { setError(text('Bitte höchstens 20 Fälle auswählen.', 'Select at most 20 cases.')); return }
    setSelectedIds(next)
    setError('')
  }
  function failure(error) { return error.details?.retryWithNewRunId ? text('Die Auswertung ist fehlgeschlagen. Erneutes Sammeln startet eine neue Auswertung.', 'Analysis failed. Collecting insights again starts a new analysis.') : error.code === 'functions/aborted' ? text('Fälle oder Artikel wurden inzwischen geändert. Bitte neu laden und erneut auswählen.', 'Cases or the article changed. Reload and select again.') : error.code === 'functions/failed-precondition' ? text('Der Vorgang kann so nicht ausgeführt werden. Auswahl und Artikel prüfen und neu laden.', 'This action is unavailable. Check the selected cases and article, then reload.') : text('Vorgang fehlgeschlagen. Verbindung und Berechtigung prüfen; bei erneutem Versuch wird dieselbe Anfrage verwendet.', 'Action failed. Check connection and permissions; retry uses the same request.') }
  async function learn() {
    if (!canLearn || busy || !selection.length || !target) return
    const targetArticle = target === 'new' ? null : articles.find((item) => item.id === target)
    if (target !== 'new' && !targetArticle) { setError(text('Zielartikel nicht verfügbar.', 'Target article unavailable.')); return }
    const values = { gapId: record.id, caseIds: selection, targetArticleId: targetArticle?.id || '', ...(targetArticle ? { expectedArticleRevision: targetArticle.revision } : {}) }
    const signature = JSON.stringify(values)
    if (attempt.current?.signature !== signature) attempt.current = { signature, runId: crypto.randomUUID() }
    setBusy('learn')
    setError('')
    try {
      const result = await learnKnowledgeCases({ ...values, runId: attempt.current.runId })
      if (active.current) { setRun(result); setSelectedIds([]); setAppliedArticleId(''); attempt.current = null; onRefresh() }
    } catch (error) { if (error.details?.retryWithNewRunId) attempt.current = null; if (active.current) setError(failure(error)) }
    finally { if (active.current) setBusy('') }
  }
  async function apply() {
    if (!canLearn || busy || !run || run.status !== 'ready') return
    setBusy('apply')
    setError('')
    try {
      const result = await applyKnowledgeLearning({ runId: run.runId || run.id, expectedRevision: run.revision })
      if (active.current) { setRun((previous) => ({ ...previous, status: 'applied' })); setAppliedArticleId(result.id); onRefresh() }
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
    try { await manageKnowledgeCase(values); if (active.current) { setManagement(null); setSelectedIds((previous) => previous.filter((id) => id !== item.id)); onRefresh() } }
    catch (error) { if (active.current) setError(failure(error)) }
    finally { if (active.current) setBusy('') }
  }
  const role = (value) => roleLabels[value]?.[en ? 1 : 0] || roleLabels.unknown[en ? 1 : 0]
  return <KnowledgeDialog title={record.category === 'unassigned' || record.id === 'unassigned' ? text('Nicht zugeordnet', 'Unassigned') : record.title} large onClose={() => { if (!busy) onClose() }}>
    <div className="knowledge-case-toolbar"><span>{items.length} {text('Fälle', 'cases')} · {items.filter(knowledgeCasePending).length} {text('ausstehend', 'pending')} · {items.filter((item) => !knowledgeCasePending(item)).length} {text('ausgewertet', 'analyzed')}</span><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => { onRefresh(); if (handbookReadable) { setRunsLoading(true); setRunRetry((value) => value + 1) } }}>{text('Neu laden', 'Reload')}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="knowledge-review-grid">
      <div className="knowledge-case-pairs"><div className="knowledge-case-columns"><h3>{text('Eingang', 'Incoming')}</h3><h3>{text('Antwort', 'Reply')}</h3></div>
        {canLearn && <div className="knowledge-case-selection"><label><input type="checkbox" checked={allSelected} disabled={Boolean(busy) || !visibleSelectable.length} onChange={(event) => selectAll(event.target.checked)} /> {text('Alle sichtbaren auswählen', 'Select all visible')}</label><span>{selection.length}/20 {text('ausgewählt', 'selected')}</span></div>}
        {!items.length && <p>{text('Keine Fallkopien vorhanden.', 'No case copies available.')}</p>}
        {visible.map((item, index) => {
          const answer = knowledgeCaseAnswer(item)
          const answerLabel = answer.kind === 'accepted' ? text('Versand angenommen', 'Send accepted') : answer.kind === 'unknown' ? text('Versandstatus unklar', 'Send status unknown') : text('KI-Entwurf', 'AI draft')
          return <article key={item.id} className="knowledge-case-pair"><div className="knowledge-case-copy"><header><div className="knowledge-case-select">{canLearn && <input type="checkbox" aria-label={`${text('Fall', 'Case')} ${page * 20 + index + 1} ${text('auswählen', 'select')}`} checked={selection.some((selected) => selected.id === item.id)} disabled={Boolean(busy) || !selectable(item)} onChange={(event) => select(item, event.target.checked)} />}<KnowledgeBrain pending={knowledgeCasePending(item)} language={language} /><strong>{role(item.senderRole)} → {role(item.recipientRole)}</strong></div><small>{dateTime(item.suggestionAt || item.updatedAt, en)}</small></header><p className="quality-protocol">{item.incomingText || text('Für diese ältere Kopie ist kein Eingangstext hinterlegt.', 'No incoming text is recorded for this older copy.')}</p></div>
            <div className="knowledge-case-copy"><header><strong>{role(item.recipientRole)} → {role(item.senderRole)}</strong><small>{answerLabel} · {dateTime(answer.kind === 'draft' ? item.suggestionAt : item.sentAt || item.updatedAt, en)}</small></header><p className="quality-protocol">{answer.text || text('Kein Antworttext hinterlegt.', 'No reply text recorded.')}</p></div>
            {canManage && <div className="knowledge-case-management">{management?.id === item.id ? management.action === 'remove' ? <><span>{text('Nur diese Wissenskopie entfernen?', 'Remove only this knowledge copy?')}</span><button className="button button--danger" disabled={Boolean(busy)} onClick={() => void manage(item)}>{text('Entfernen', 'Remove')}</button><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => setManagement(null)}>{text('Abbrechen', 'Cancel')}</button></> : <><select aria-label={text('Zuordnung', 'Assignment')} value={management.target} disabled={Boolean(busy)} onChange={(event) => setManagement((previous) => ({ ...previous, target: event.target.value }))}><option value="">{text('Ziel wählen', 'Choose destination')}</option><option value="group:unassigned">{text('Nicht zugeordnet', 'Unassigned')}</option><optgroup label={text('Artikelvorschläge', 'Article suggestions')}>{groups.filter((group) => group.id !== record.id && group.id !== 'unassigned' && group.category !== 'article').map((group) => <option key={group.id} value={`group:${group.id}`}>{group.title}</option>)}</optgroup>{handbookReadable && <optgroup label={text('Handbuchartikel', 'Handbook articles')}>{articles.map((article) => <option key={article.id} value={`article:${article.id}`}>{article.title}</option>)}</optgroup>}</select><button className="button" disabled={Boolean(busy) || !management.target} onClick={() => void manage(item)}>{text('Zuordnen', 'Assign')}</button><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => setManagement(null)}>{text('Abbrechen', 'Cancel')}</button></> : <><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => setManagement({ id: item.id, action: 'move', target: '' })}>{text('Zuordnen', 'Assign')}</button><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => setManagement({ id: item.id, action: 'remove' })}>{text('Kopie entfernen', 'Remove copy')}</button></>}</div>}
          </article>
        })}
        {items.length > 20 && <div className="knowledge-case-pagination"><button className="button button--secondary" disabled={page === 0 || Boolean(busy)} onClick={() => setPageIndex(page - 1)}>{text('Zurück', 'Previous')}</button><span>{page + 1}/{Math.ceil(items.length / 20)}</span><button className="button button--secondary" disabled={(page + 1) * 20 >= items.length || Boolean(busy)} onClick={() => setPageIndex(page + 1)}>{text('Weiter', 'Next')}</button></div>}
      </div>
      <aside className="knowledge-case-insights"><h3>{text('Erkenntnisse & Artikel', 'Insights & article')}</h3>
        {canLearn && <div className="knowledge-learning-controls"><label className="form-field"><span>{text('Zielartikel', 'Target article')}</span><select value={target} disabled={Boolean(busy)} onChange={(event) => setTarget(event.target.value)}><option value="">{text('Ziel wählen', 'Choose target')}</option><option value="new">{text('Neuen Artikel entwerfen', 'Draft a new article')}</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}</select></label><button className="button" disabled={Boolean(busy) || !selection.length || !target} onClick={() => void learn()}>{busy === 'learn' ? text('Erkenntnisse werden gesammelt …', 'Collecting insights …') : text('Erkenntnisse sammeln', 'Collect insights')}</button></div>}
        {runsLoading && <p role="status">{text('Vorschläge werden geladen …', 'Loading proposals …')}</p>}
        {run?.status === 'running' && <p role="status">{text('Eine Auswertung läuft. Zum Aktualisieren neu laden.', 'An analysis is running. Reload to update.')}</p>}
        {run?.sources?.length > 0 && <p className="quality-revision-meta">{text('Auswertung aus', 'Analysis of')} {run.sources.length} {text('ausgewählten Fällen', 'selected cases')}</p>}
        {run?.insights && <div className="knowledge-learning-insights">{[['variants', text('Varianten', 'Variants')], ['conflicts', text('Widersprüche', 'Conflicts')], ['openQuestions', text('Offene Fragen', 'Open questions')]].map(([key, label]) => <section key={key}><h4>{label}</h4><p className="quality-protocol">{run.insights[key] || '—'}</p></section>)}</div>}
        {proposal && <section className="knowledge-learning-proposal"><h4>{run.status === 'applied' ? text('Übernommener Vorschlag', 'Applied proposal') : text('Vorschlag · noch nicht übernommen', 'Proposal · not applied yet')}</h4><ArticleText article={proposal} language={language} />{canLearn && run.status === 'ready' && <button className="button" disabled={Boolean(busy)} onClick={() => void apply()}>{busy === 'apply' ? text('Wird übernommen …', 'Applying …') : run.targetArticleId ? text('Änderungen übernehmen', 'Apply changes') : text('Als Entwurf ablegen', 'Save as draft')}</button>}{run.status === 'applied' && <p className="knowledge-applied" role="status">{text('Übernommen', 'Applied')}{(appliedArticleId || run.appliedResult?.id || run.targetArticleId) && <> · <Link to={knowledgeUrl('article', appliedArticleId || run.appliedResult?.id || run.targetArticleId)}>{text('Artikel öffnen', 'Open article')}</Link></>}</p>}</section>}
        {currentArticle && <details className="knowledge-current-article"><summary>{text('Aktueller Artikel', 'Current article')} · {currentArticle.title}</summary><ArticleText article={currentArticle} language={language} /><Link to={knowledgeUrl('article', currentArticle.id)}>{text('Artikel öffnen', 'Open article')}</Link></details>}
        {!proposal && !currentArticle && !runsLoading && <p className="quality-revision-meta">{text('Noch kein Vorschlag vorhanden.', 'No proposal yet.')}</p>}
      </aside>
    </div>
  </KnowledgeDialog>
}
