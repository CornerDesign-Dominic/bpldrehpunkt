import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { listDepartments } from '../lib/departments.js'
import { listQualityHandbookCatalog } from '../lib/quality.js'
import { groupHandbookCatalog, isQualityReviewOverdue, qualityHandbookUrl } from '../lib/qualityPresentation.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import QualityEditor from '../components/quality/QualityEditor.jsx'
import { useQualityToday } from '../components/quality/useQualityToday.js'
import '../styles/quality.css'

export default function QualityHandbookCatalogPage() {
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const { canEdit } = usePermissions()
  const editable = canEdit('handbook')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const departmentId = params.get('department') || ''
  const search = params.get('q') || ''
  const [state, setState] = useState({ loading: true, records: [], departments: [] })
  const [retry, setRetry] = useState(0)
  const [editor, setEditor] = useState(null)
  const today = useQualityToday()
  useEffect(() => {
    let active = true
    Promise.all([listQualityHandbookCatalog(), listDepartments().catch((error) => {
      void reportTechnicalFailure({ module: 'handbook', stage: 'load', error })
      throw error
    })]).then(([records, departments]) => { if (active) setState({ loading: false, records, departments }) })
      .catch(() => { if (active) setState((previous) => ({ ...previous, loading: false, error: true })) })
    return () => { active = false }
  }, [retry])
  function filter(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }
  const groups = groupHandbookCatalog(state.records, { departmentId, search })
  const count = groups.reduce((sum, group) => sum + group.articles.length, 0)
  const departmentName = (id) => state.departments.find((item) => item.id === id)?.name || text('Abteilung nicht verfügbar', 'Department unavailable')
  return <div className="quality-page quality-catalog">
    <div className="quality-toolbar">
      <label className="form-field quality-search"><span>{text('Handbuch durchsuchen', 'Search handbook')}</span><input type="search" value={search} onChange={(event) => filter('q', event.target.value)} placeholder={text('Was möchtest du nachschlagen?', 'What are you looking for?')} /></label>
      <label className="form-field"><span>{text('Abteilung', 'Department')}</span><select value={departmentId} onChange={(event) => filter('department', event.target.value)}><option value="">{text('Alle Abteilungen', 'All departments')}</option>{state.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {editable && <button className="button" disabled={state.loading || state.error || !state.departments.some((item) => item.active)} onClick={() => setEditor({ id: crypto.randomUUID(), departmentId: state.departments.find((item) => item.id === departmentId && item.active)?.id || state.departments.find((item) => item.active)?.id })}>{text('Artikel hinzufügen', 'Add article')}</button>}
    </div>
    {state.loading ? <p role="status">{text('Wird geladen …', 'Loading …')}</p> : state.error ? <div role="alert" className="form-error"><p>{text('Das Handbuch konnte nicht geladen werden.', 'The handbook could not be loaded.')}</p><button className="button button--secondary" onClick={() => { setState((previous) => ({ ...previous, loading: true })); setRetry((value) => value + 1) }}>{text('Erneut versuchen', 'Retry')}</button></div> : <>
      <div className="quality-catalog-count">{count} {text('Artikel', 'articles')} · {groups.length} {text('Kapitel', 'chapters')}</div>
      {count === 0 && <p className="quality-empty">{search || departmentId ? text('Keine passenden Artikel.', 'No matching articles.') : text('Noch keine Artikel.', 'No articles yet.')}</p>}
      <div className="quality-catalog-chapters">{groups.map((group) => <section className="quality-catalog-chapter" key={group.chapter}>
        <header><h3>{group.chapter}</h3><span>{group.articles.length}</span></header>
        <ul>{group.articles.map((article) => <li key={article.id}><Link to={`${qualityHandbookUrl(article.id)}?${new URLSearchParams({ catalog: params.toString() })}`} className={isQualityReviewOverdue(article, today) ? 'quality-article-link quality-review--overdue' : 'quality-article-link'}><span className="quality-article-title">{article.title}</span><span className="quality-article-meta">{!departmentId && <small>{departmentName(article.departmentId)}</small>}{isQualityReviewOverdue(article, today) && <span className="quality-overdue-badge">{text('Kontrolle überfällig', 'Review overdue')}</span>}<span aria-hidden="true">›</span></span></Link></li>)}</ul>
      </section>)}</div>
    </>}
    {editor && <QualityEditor kind="handbook" record={editor} departmentId={editor.departmentId} departments={state.departments} handbookEntries={state.records} editable={editable} language={language} onClose={() => setEditor(null)} onSaved={(saved) => navigate(`${qualityHandbookUrl(saved.id)}?${new URLSearchParams({ catalog: params.toString() })}`)} />}
  </div>
}
