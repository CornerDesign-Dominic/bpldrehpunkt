import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/useLanguage.js'
import { usePermissions } from '../auth/usePermissions.js'
import { listKnowledge, listKnowledgeCases, updateKnowledgeGap } from '../lib/knowledge.js'
import { knowledgeUrl } from '../lib/knowledgePresentation.js'
import { knowledgeCaseGroups } from '../lib/knowledgeCases.js'
import KnowledgeGapEditor from '../components/quality/KnowledgeGapEditor.jsx'
import KnowledgeCaseReview, { KnowledgeBrain } from '../components/quality/KnowledgeCaseReview.jsx'
import '../styles/quality.css'
import '../styles/knowledge.css'

const gapStatuses = { open: ['Offen', 'Open'], in_progress: ['In Bearbeitung', 'In progress'], resolved: ['Erledigt', 'Done'], ignored: ['Zurückgestellt', 'Deferred'] }
const dateTime = (value, en) => value?.toDate?.().toLocaleString(en ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) || '—'

export default function KnowledgeGapsPage() {
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const { canEdit, canView } = usePermissions()
  const editable = canEdit('knowledgeGaps')
  const handbookReadable = canView('handbook')
  const handbookEditable = canEdit('handbook')
  const [state, setState] = useState({ loading: true, records: [], cases: [], articles: [] })
  const [retry, setRetry] = useState(0)
  const [status, setStatus] = useState('active')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)
  const [reviewId, setReviewId] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const articles = handbookReadable ? listKnowledge('article').then((items) => ({ items })).catch(() => ({ items: [], error: true })) : Promise.resolve({ items: [] })
    Promise.all([listKnowledge('gap'), listKnowledgeCases(), articles]).then(([records, cases, articleResult]) => { if (active) setState({ loading: false, records, cases, articles: articleResult.items, articleError: articleResult.error }) }).catch(() => { if (active) setState((previous) => ({ ...previous, loading: false, error: true })) })
    return () => { active = false }
  }, [retry, handbookReadable])
  function reload() { setState((previous) => ({ ...previous, loading: true })); setRetry((value) => value + 1) }
  const groups = knowledgeCaseGroups(state.records, state.cases)
  const records = groups.filter((item) => (status === 'active' ? ['open', 'in_progress'].includes(item.status) : status === 'all' || item.status === status) && (category === 'all' || (item.category || 'gap') === category) && (!search.trim() || `${item.title} ${item.process || ''} ${item.missing || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  const reviewed = groups.find((item) => item.id === reviewId)
  async function quickStatus(record) {
    if (pendingId || record.virtual) return
    setPendingId(record.id)
    setError('')
    try { await updateKnowledgeGap(record, record.status === 'resolved' ? 'open' : 'resolved', record.articleId || ''); reload() }
    catch (failure) { setError(failure.code === 'functions/aborted' ? text('Inzwischen geändert. Bitte neu laden und erneut versuchen.', 'Changed by another user. Reload and retry.') : text('Status konnte nicht gespeichert werden.', 'Status could not be saved.')) }
    finally { setPendingId(null) }
  }
  return <div className="quality-page knowledge-page"><div className="quality-toolbar">
    <label className="form-field quality-search"><span>{text('Suche', 'Search')}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <label className="form-field"><span>{text('Zuordnung', 'Assignment')}</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">{text('Alle', 'All')}</option><option value="gap">{text('Wissenslücken', 'Knowledge gaps')}</option><option value="article">{text('Handbuchartikel', 'Handbook articles')}</option><option value="unassigned">{text('Nicht zugeordnet', 'Unassigned')}</option></select></label>
    <label className="form-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">{text('Offen & in Bearbeitung', 'Open & in progress')}</option>{Object.keys(gapStatuses).map((value) => <option key={value} value={value}>{gapStatuses[value][en ? 1 : 0]}</option>)}<option value="all">{text('Alle', 'All')}</option></select></label>
    <button className="button button--secondary" disabled={state.loading || Boolean(pendingId)} onClick={reload}>{text('Neu laden', 'Reload')}</button>
  </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {state.articleError && <p className="form-error" role="alert">{text('Artikel konnten nicht geladen werden. Fallkopien bleiben verfügbar.', 'Articles could not be loaded. Case copies remain available.')}</p>}
    {state.loading ? <p role="status">{text('Wird geladen …', 'Loading …')}</p> : state.error ? <div className="form-error" role="alert"><p>{text('Wissensfälle konnten nicht geladen werden.', 'Knowledge cases could not be loaded.')}</p><button className="button button--secondary" onClick={reload}>{text('Erneut versuchen', 'Retry')}</button></div> : !records.length ? <p className="quality-empty">{text('Keine passenden Fälle.', 'No matching cases.')}</p> : <ul className="knowledge-gaps">{records.map((item) => <li key={item.id}>
      <button className="knowledge-case-card" onClick={() => setReviewId(item.id)}><KnowledgeBrain pending={item.pendingCount > 0} empty={item.caseCount === 0} language={language} /><span className="knowledge-gap-count">{item.caseCount}×</span><span className="knowledge-gap-content"><strong>{item.category === 'unassigned' || item.id === 'unassigned' ? text('Nicht zugeordnet', 'Unassigned') : item.title}</strong>{item.missing && <span className="knowledge-case-description">{item.missing}</span>}<small>{[item.process, gapStatuses[item.status]?.[en ? 1 : 0], `${item.pendingCount} ${text('ausstehend', 'pending')} · ${item.caseCount - item.pendingCount} ${text('ausgewertet', 'analyzed')}`].filter(Boolean).join(' · ')}</small>{item.status === 'resolved' && <span className="knowledge-case-completed">{text('Erledigt', 'Done')} · {dateTime(item.resolvedAt, en)} · {item.resolvedByName || item.resolvedBy || '—'}</span>}</span><span aria-hidden="true">›</span></button>
      <div className="knowledge-gap-actions">{item.articleId && handbookReadable && <Link className="button button--secondary" to={knowledgeUrl('article', item.articleId)}>{text('Artikel', 'Article')}</Link>}{editable && !item.virtual && <><button className="button button--secondary" disabled={Boolean(pendingId)} onClick={() => void quickStatus(item)}>{pendingId === item.id ? text('Wird gespeichert …', 'Saving …') : item.status === 'resolved' ? text('Wieder öffnen', 'Reopen') : text('Erledigt', 'Done')}</button><button className="button button--secondary" disabled={Boolean(pendingId)} onClick={() => setEditor(item)}>{text('Status ändern', 'Change status')}</button></>}</div>
    </li>)}</ul>}
    {editor && <KnowledgeGapEditor key={editor.id} record={editor} articles={state.articles} canLinkArticles={handbookReadable && !state.articleError} language={language} onClose={(options) => { setEditor(null); if (options?.reload) reload() }} onSaved={() => { setEditor(null); reload() }} />}
    {reviewed && <KnowledgeCaseReview key={reviewed.id} record={reviewed} cases={reviewed.cases} groups={groups} articles={state.articles} handbookReadable={handbookReadable && !state.articleError} canManage={editable} canLearn={editable && handbookEditable && !state.articleError} language={language} onClose={() => setReviewId(null)} onRefresh={reload} />}
  </div>
}
