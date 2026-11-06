import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/useLanguage.js'
import { usePermissions } from '../auth/usePermissions.js'
import { watchKnowledge, watchKnowledgeCases, watchKnowledgeLearningRuns, updateKnowledgeGap } from '../lib/knowledge.js'
import { knowledgeUrl } from '../lib/knowledgePresentation.js'
import { knowledgeCaseGroups, knowledgeGroupRun } from '../lib/knowledgeCases.js'
import { useKnowledgeLearningWork } from '../lib/useKnowledgeLearningWork.js'
import KnowledgeGapEditor from '../components/quality/KnowledgeGapEditor.jsx'
import EmptyKnowledgeGroupEditor from '../components/quality/EmptyKnowledgeGroupEditor.jsx'
import KnowledgeCaseReview, { KnowledgeBrain } from '../components/quality/KnowledgeCaseReview.jsx'
import '../styles/quality.css'
import '../styles/knowledge.css'

export default function KnowledgeGapsPage() {
  const navigate = useNavigate()
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const { canEdit, canView } = usePermissions()
  const editable = canEdit('knowledgeGaps')
  const handbookReadable = canView('handbook')
  const handbookEditable = canEdit('handbook')
  const [state, setState] = useState({ loading: true, records: [], cases: [], articles: [], runs: [] })
  const { work, start: startLearning } = useKnowledgeLearningWork()
  const [retry, setRetry] = useState(0)
  const [visibility, setVisibility] = useState('visible')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)
  const [emptyEditor, setEmptyEditor] = useState(null)
  const [reviewId, setReviewId] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const keys = ['records', 'cases', ...(handbookReadable ? ['articles', 'runs'] : [])]
    const pending = new Set(keys)
    let first = true
    const update = (patch) => {
      const initial = first
      first = false
      if (active) setState((previous) => ({ ...(initial ? { records: [], cases: [], articles: [], runs: [] } : previous), ...patch, loading: pending.size > 0 }))
    }
    const receive = (key) => (items) => {
      pending.delete(key)
      update({ [key]: items })
    }
    const failed = (key) => () => {
      pending.delete(key)
      update({ [key === 'articles' ? 'articleError' : key === 'runs' ? 'runError' : 'error']: true })
    }
    const unsubscribe = [watchKnowledge('gap', receive('records'), failed('records')), watchKnowledgeCases(receive('cases'), failed('cases'))]
    if (handbookReadable) unsubscribe.push(watchKnowledge('article', receive('articles'), failed('articles')), watchKnowledgeLearningRuns(receive('runs'), failed('runs')))
    return () => { active = false; unsubscribe.forEach((stop) => stop()) }
  }, [retry, handbookReadable])
  function reload() { setRetry((value) => value + 1) }
  const groups = knowledgeCaseGroups(state.records, state.cases, handbookReadable ? state.articles : [])
  const groupRun = (id) => handbookReadable ? knowledgeGroupRun(state.runs, id, work[id]) : null
  const records = groups.filter((item) => (visibility === 'all' || (item.hidden === true) === (visibility === 'hidden')) && (category === 'all' || (item.category || 'gap') === category) && (!search.trim() || `${item.title} ${item.process || ''} ${item.topic || ''} ${item.missing || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  const sectionOf = (item) => item.category === 'article' ? item.process || text('Handbuchartikel', 'Handbook articles') : item.id === 'unassigned' ? text('Nicht zugeordnet', 'Unassigned') : text('Artikelvorschläge', 'Article suggestions')
  const sections = [...new Set(records.filter((item) => item.category === 'article').map(sectionOf))].sort((a, b) => a.localeCompare(b, en ? 'en' : 'de'))
  for (const section of [text('Artikelvorschläge', 'Article suggestions'), text('Nicht zugeordnet', 'Unassigned')]) if (records.some((item) => sectionOf(item) === section) && !sections.includes(section)) sections.push(section)
  const reviewed = groups.find((item) => item.id === reviewId)
  async function toggleVisibility(record) {
    if (pendingId) return
    setPendingId(record.id)
    setError('')
    try { await updateKnowledgeGap(record, { hidden: record.hidden !== true }) }
    catch (failure) { setError(failure.code === 'functions/aborted' ? text('Inzwischen geändert. Bitte neu laden und erneut versuchen.', 'Changed by another user. Reload and retry.') : text('Sichtbarkeit konnte nicht gespeichert werden.', 'Visibility could not be saved.')) }
    finally { setPendingId(null) }
  }
  return <div className="quality-page knowledge-page"><div className="quality-toolbar">
    <label className="form-field quality-search"><span>{text('Suche', 'Search')}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <label className="form-field knowledge-filter"><span>{text('Zuordnung', 'Assignment')}</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">{text('Alle', 'All')}</option><option value="article">{text('Handbuchartikel', 'Handbook articles')}</option><option value="gap">{text('Artikelvorschläge', 'Article suggestions')}</option><option value="unassigned">{text('Nicht zugeordnet', 'Unassigned')}</option></select></label>
    <label className="form-field knowledge-filter"><span>{text('Anzeige', 'Visibility')}</span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="visible">{text('Eingeblendet', 'Visible')}</option><option value="hidden">{text('Ausgeblendet', 'Hidden')}</option><option value="all">{text('Alle', 'All')}</option></select></label>
  </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {state.runError && <p className="form-error" role="alert">{text('Lernergebnisse konnten nicht geladen werden.', 'Learning results could not be loaded.')} <button className="button button--secondary" onClick={reload}>{text('Erneut versuchen', 'Retry')}</button></p>}
    {state.articleError && <p className="form-error" role="alert">{text('Artikel konnten nicht geladen werden. Fallkopien bleiben verfügbar.', 'Articles could not be loaded. Case copies remain available.')}</p>}
    {state.loading ? <p role="status">{text('Wird geladen …', 'Loading …')}</p> : state.error ? <div className="form-error" role="alert"><p>{text('Wissensfälle konnten nicht geladen werden.', 'Knowledge cases could not be loaded.')}</p><button className="button button--secondary" onClick={reload}>{text('Erneut versuchen', 'Retry')}</button></div> : !records.length ? <p className="quality-empty">{text('Keine passenden Einträge.', 'No matching entries.')}</p> : sections.map((section) => <section className="knowledge-case-section" key={section}><h2>{section}</h2><ul className="knowledge-gaps">{records.filter((item) => sectionOf(item) === section).map((item) => { const run = groupRun(item.id); return <li key={item.id}>
      <button className="knowledge-case-card" onClick={() => setReviewId(item.id)}>{run?.status === 'running' ? <span className="knowledge-learning-spinner" role="status" aria-label={text('Lernen läuft', 'Learning in progress')} /> : <KnowledgeBrain pending={item.pendingCount > 0} empty={item.caseCount === 0} language={language} />}<span className="knowledge-gap-count">{item.caseCount}×</span><span className="knowledge-gap-content"><strong>{item.category === 'unassigned' || item.id === 'unassigned' ? text('Nicht zugeordnet', 'Unassigned') : item.title}</strong>{item.missing && <span className="knowledge-case-description">{item.missing}</span>}<small>{[run?.status === 'running' ? text('Lernen läuft', 'Learning in progress') : run?.status === 'ready' ? text('Ergebnis bereit', 'Result ready') : run?.status === 'failed' ? text('Lernen fehlgeschlagen', 'Learning failed') : '', item.topic, item.hidden && text('Ausgeblendet', 'Hidden'), `${item.pendingCount} ${text('ausstehend', 'pending')} · ${item.caseCount - item.pendingCount} ${text('ausgewertet', 'analyzed')}`].filter(Boolean).join(' · ')}</small></span><span aria-hidden="true">›</span></button>
      <div className="knowledge-gap-actions">{item.articleId && handbookReadable && <Link className="button button--secondary" to={knowledgeUrl('article', item.articleId)}>{text('Artikel', 'Article')}</Link>}{editable && <><button className="button button--secondary" disabled={Boolean(pendingId)} onClick={() => void toggleVisibility(item)}>{pendingId === item.id ? text('Wird gespeichert …', 'Saving …') : item.hidden ? text('Einblenden', 'Show') : text('Ausblenden', 'Hide')}</button>{handbookReadable && !state.articleError && item.category !== 'article' && item.caseCount > 0 && <button className="button button--secondary" disabled={Boolean(pendingId)} onClick={() => setEditor(item)}>{text('Verschieben', 'Move')}</button>}{item.category !== 'article' && item.id !== 'unassigned' && !item.virtual && item.caseCount === 0 && <>{handbookEditable && <button className="button button--secondary" disabled={Boolean(pendingId)} onClick={() => setEmptyEditor({ record: item, action: 'createArticle' })}>{text('Artikel erstellen', 'Create article')}</button>}<button className="button button--secondary" disabled={Boolean(pendingId)} onClick={() => setEmptyEditor({ record: item, action: 'remove' })}>{text('Entfernen', 'Remove')}</button></>}</>}</div>
    </li> })}</ul></section>)}
    {editor && <KnowledgeGapEditor key={editor.id} record={editor} articles={state.articles} canLinkArticles={handbookReadable && !state.articleError} language={language} onClose={(options) => { setEditor(null); if (options?.reload) reload() }} onSaved={() => setEditor(null)} />}
    {emptyEditor && <EmptyKnowledgeGroupEditor record={emptyEditor.record} action={emptyEditor.action} language={language} onClose={() => { setEmptyEditor(null); reload() }} onSaved={result => { setEmptyEditor(null); if (result.articleId) navigate(knowledgeUrl('article', result.articleId)); else reload() }} />}
    {reviewed && <KnowledgeCaseReview key={reviewed.id} record={reviewed} cases={reviewed.cases} groups={groups} articles={state.articles} handbookReadable={handbookReadable && !state.articleError} canManage={editable} canLearn={editable && handbookEditable && !state.articleError && !state.runError} language={language} onClose={() => setReviewId(null)} run={groupRun(reviewed.id)} onLearn={startLearning} />}
  </div>
}
