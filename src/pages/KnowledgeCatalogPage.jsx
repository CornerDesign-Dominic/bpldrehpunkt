import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../i18n/useLanguage.js'
import { usePermissions } from '../auth/usePermissions.js'
import { listKnowledge } from '../lib/knowledge.js'
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_STATUSES, filterKnowledge, knowledgeLabels, knowledgeUrl, knowledgeOverdue } from '../lib/knowledgePresentation.js'
import { useQualityToday } from '../components/quality/useQualityToday.js'
import KnowledgeEditor from '../components/quality/KnowledgeEditor.jsx'
import '../styles/quality.css'
import '../styles/knowledge.css'

export default function KnowledgeCatalogPage({ kind = 'article' }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const label = (key) => knowledgeLabels[key]?.[en ? 1 : 0] || key
  const { canEdit } = usePermissions()
  const editable = canEdit('handbook')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState({ loading: true, records: [] })
  const [retry, setRetry] = useState(0)
  const [editor, setEditor] = useState(null)
  const today = useQualityToday()
  useEffect(() => {
    let active = true
    listKnowledge(kind).then((records) => { if (active) setState({ loading: false, records }) }).catch(() => { if (active) setState((previous) => ({ ...previous, loading: false, error: true })) })
    return () => { active = false }
  }, [kind, retry])
  const status = params.get('status') || 'active'
  const process = params.get('process') || ''
  const audience = params.get('audience') || ''
  const search = params.get('q') || ''
  const records = filterKnowledge(status === 'active' ? state.records.filter((item) => item.status !== 'archived') : state.records, { search, status: ['active', 'all'].includes(status) ? '' : status, process, audience })
  const groups = kind === 'rule' ? [...new Set(records.map((item) => item.audience))] : [...new Set(records.map((item) => item.process))].sort((left, right) => left.localeCompare(right))
  function filter(key, value) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }) }
  function reload() { setState((previous) => ({ ...previous, loading: true })); setRetry((value) => value + 1) }
  return <div className="quality-page knowledge-page">
    <div className="quality-toolbar"><label className="form-field quality-search"><span>{text('Suche', 'Search')}</span><input type="search" value={search} onChange={(event) => filter('q', event.target.value)} placeholder={text('Was möchtest du nachschlagen?', 'What are you looking for?')} /></label>
      <label className="form-field"><span>{label(kind === 'rule' ? 'audience' : 'process')}</span><select value={kind === 'rule' ? audience : process} onChange={(event) => filter(kind === 'rule' ? 'audience' : 'process', event.target.value)}><option value="">{text('Alle', 'All')}</option>{(kind === 'rule' ? KNOWLEDGE_AUDIENCES : [...new Set(state.records.map((item) => item.process))].sort()).map((value) => <option key={value} value={value}>{kind === 'rule' ? label(value) : value}</option>)}</select></label>
      <label className="form-field"><span>Status</span><select value={status} onChange={(event) => filter('status', event.target.value)}><option value="active">{text('Aktuell', 'Current')}</option>{KNOWLEDGE_STATUSES.map((value) => <option value={value} key={value}>{label(value)}</option>)}<option value="all">{text('Alle', 'All')}</option></select></label>
      {editable && <button className="button" disabled={state.loading || state.error} onClick={() => setEditor({ id: crypto.randomUUID(), ...(kind === 'article' ? { process } : { audience: audience || 'general' }) })}>{text(kind === 'rule' ? 'Grundregel hinzufügen' : 'Artikel hinzufügen', kind === 'rule' ? 'Add ground rule' : 'Add article')}</button>}
    </div>
    {state.loading ? <p role="status">{text('Wird geladen …', 'Loading …')}</p> : state.error ? <div className="form-error" role="alert"><p>{text('Daten konnten nicht geladen werden.', 'Data could not be loaded.')}</p><button className="button button--secondary" onClick={reload}>{text('Erneut versuchen', 'Retry')}</button></div> : <><div className="quality-catalog-count">{records.length} {text(kind === 'rule' ? 'Grundregeln' : 'Artikel', kind === 'rule' ? 'ground rules' : 'articles')}</div>{!records.length && <p className="quality-empty">{text('Keine Einträge.', 'No entries.')}</p>}<div className="quality-catalog-chapters">{groups.map((group) => <section className="quality-catalog-chapter" key={group}><header><h3>{kind === 'rule' ? label(group) : group}</h3></header><ul>{records.filter((item) => (kind === 'rule' ? item.audience : item.process) === group).map((item) => <li key={item.id}><Link className={`quality-article-link${knowledgeOverdue(item, today) ? ' quality-review--overdue' : ''}`} to={`${knowledgeUrl(kind, item.id)}?${new URLSearchParams({ catalog: params.toString() })}`}><span className="quality-article-title">{item.title}{item.topic && <small className="knowledge-topic">{item.topic}</small>}</span><span className="quality-article-meta"><small>{label(item.status)}</small>{knowledgeOverdue(item, today) && <span className="quality-overdue-badge">{text('Prüfung überfällig', 'Review overdue')}</span>}<span aria-hidden="true">›</span></span></Link></li>)}</ul></section>)}</div></>}
    {editor && <KnowledgeEditor kind={kind} record={editor} articles={kind === 'article' ? state.records : []} language={language} onClose={(options) => { setEditor(null); if (options?.reload) reload() }} onSaved={(saved) => navigate(`${knowledgeUrl(kind, saved.id)}?${new URLSearchParams({ catalog: params.toString() })}`)} />}
  </div>
}
