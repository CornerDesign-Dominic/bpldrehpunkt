import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/useLanguage.js'
import { usePermissions } from '../auth/usePermissions.js'
import { listKnowledge, updateKnowledgeGap } from '../lib/knowledge.js'
import { knowledgeLabels, knowledgeUrl } from '../lib/knowledgePresentation.js'
import KnowledgeEditor from '../components/quality/KnowledgeEditor.jsx'
import KnowledgeDialog from '../components/quality/KnowledgeDialog.jsx'
import '../styles/quality.css'
import '../styles/knowledge.css'

function GapEditor({ record, articles, language, onClose, onSaved }) {
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const [status, setStatus] = useState(record.status)
  const [articleId, setArticleId] = useState(record.articleId || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = status !== record.status || articleId !== (record.articleId || '')
  const [discard, setDiscard] = useState(false)
  const [conflict, setConflict] = useState(false)
  useEffect(() => {
    if (!dirty) return undefined
    const prevent = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  function close() { if (saving) return; if (dirty) setDiscard(true); else onClose({ reload: conflict }) }
  async function save(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try { await updateKnowledgeGap(record, status, articleId); onSaved() }
    catch (failure) { setConflict(failure.code === 'functions/aborted'); setError(failure.code === 'functions/aborted' ? text('Inzwischen geändert. Nach dem Schließen wird neu geladen.', 'Changed by another user. Closing will reload the entry.') : text('Speichern fehlgeschlagen. Für „Abgedeckt“ einen gültigen Artikel zuordnen.', 'Saving failed. Link a valid article to mark this covered.')) }
    finally { setSaving(false) }
  }
  return <KnowledgeDialog title={record.title} onClose={close}>
    <p className="quality-protocol">{record.missing}</p>
    {discard && <div className="quality-discard" role="alert"><p>{text('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}</p><button className="button button--secondary" onClick={() => setDiscard(false)}>{text('Weiter bearbeiten', 'Keep editing')}</button> <button className="button button--danger" onClick={() => onClose({ reload: conflict })}>{text('Verwerfen', 'Discard')}</button></div>}
    <form onSubmit={save}><fieldset className="quality-fields" disabled={saving}><label className="form-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{['open', 'in_progress', 'resolved', 'ignored'].map((value) => <option key={value} value={value}>{knowledgeLabels[value][en ? 1 : 0]}</option>)}</select></label><label className="form-field"><span>{text('Artikel', 'Article')}</span><select value={articleId} required={status === 'resolved'} onChange={(event) => setArticleId(event.target.value)}><option value="">—</option>{articles.filter((article) => status !== 'resolved' || article.status === 'valid' || article.id === articleId).map((article) => <option key={article.id} value={article.id}>{article.title} · {knowledgeLabels[article.status][en ? 1 : 0]}</option>)}</select></label></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<footer className="quality-actions"><button className="button" disabled={saving || !dirty}>{saving ? text('Wird gespeichert …', 'Saving …') : text('Speichern', 'Save')}</button></footer></form>
  </KnowledgeDialog>
}

export default function KnowledgeGapsPage() {
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const { canEdit } = usePermissions()
  const editable = canEdit('handbook')
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, records: [], articles: [] })
  const [retry, setRetry] = useState(0)
  const [status, setStatus] = useState('active')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)
  const [draft, setDraft] = useState(null)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    Promise.all([listKnowledge('gap'), listKnowledge('article')]).then(([records, articles]) => { if (active) setState({ loading: false, records, articles }) }).catch(() => { if (active) setState((previous) => ({ ...previous, loading: false, error: true })) })
    return () => { active = false }
  }, [retry])
  function reload() { setState((previous) => ({ ...previous, loading: true })); setRetry((value) => value + 1) }
  const records = state.records.filter((item) => (status === 'active' ? ['open', 'in_progress'].includes(item.status) : status === 'all' || item.status === status) && (!search.trim() || `${item.title} ${item.process} ${item.missing}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))).sort((left, right) => right.count - left.count || (right.lastSeenAt?.toMillis?.() || 0) - (left.lastSeenAt?.toMillis?.() || 0))
  async function createdDraft(saved) {
    const gap = draft.gap
    setDraft(null)
    try { await updateKnowledgeGap(gap, 'in_progress', saved.id); navigate(knowledgeUrl('article', saved.id)) }
    catch { setCreated(saved.id); setError(text('Entwurf angelegt. Die Zuordnung zur Wissenslücke konnte nicht gespeichert werden.', 'Draft created. Linking it to the knowledge gap failed.')); reload() }
  }
  return <div className="quality-page knowledge-page"><div className="quality-toolbar"><label className="form-field quality-search"><span>{text('Suche', 'Search')}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="form-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">{text('Offen & in Bearbeitung', 'Open & in progress')}</option>{['open', 'in_progress', 'resolved', 'ignored'].map((value) => <option key={value} value={value}>{knowledgeLabels[value][en ? 1 : 0]}</option>)}<option value="all">{text('Alle', 'All')}</option></select></label></div>
    <p className="quality-catalog-count">{text('KI-gemeldeter Wissensbedarf · Häufigkeit nach unterschiedlichen Mails', 'AI-reported knowledge needs · frequency by distinct emails')}</p>
    {error && <div className="form-error" role="alert">{error}{created && <> <Link to={knowledgeUrl('article', created)}>{text('Entwurf öffnen', 'Open draft')}</Link></>}</div>}
    {state.loading ? <p role="status">{text('Wird geladen …', 'Loading …')}</p> : state.error ? <div className="form-error" role="alert"><p>{text('Wissenslücken konnten nicht geladen werden.', 'Knowledge gaps could not be loaded.')}</p><button className="button button--secondary" onClick={reload}>{text('Erneut versuchen', 'Retry')}</button></div> : !records.length ? <p className="quality-empty">{text('Keine Wissenslücken.', 'No knowledge gaps.')}</p> : <ul className="knowledge-gaps">{records.map((item) => <li key={item.id}><span className="knowledge-gap-count" title={text('Unterschiedliche Mails', 'Distinct emails')}>{item.count}×</span><div className="knowledge-gap-content"><h3>{item.title}</h3><p>{item.missing}</p><small>{[item.process, knowledgeLabels[item.status]?.[en ? 1 : 0], item.lastSeenAt?.toDate?.().toLocaleDateString(en ? 'en-GB' : 'de-DE')].filter(Boolean).join(' · ')}</small>{item.articleId && <div><Link to={knowledgeUrl('article', item.articleId)}>{state.articles.find((article) => article.id === item.articleId)?.title || text('Artikel öffnen', 'Open article')}</Link></div>}</div>{editable && <div className="knowledge-gap-actions"><button className="button button--secondary" onClick={() => setEditor(item)}>{text('Bearbeiten', 'Edit')}</button>{!item.articleId && <button className="button button--secondary" onClick={() => setDraft({ gap: item, record: { id: crypto.randomUUID(), title: item.title, process: item.process || '', situation: item.title, checks: item.missing } })}>{text('Artikel entwerfen', 'Draft article')}</button>}</div>}</li>)}</ul>}
    {editor && <GapEditor key={editor.id} record={editor} articles={state.articles} language={language} onClose={(options) => { setEditor(null); if (options?.reload) reload() }} onSaved={() => { setEditor(null); reload() }} />}
    {draft && <KnowledgeEditor kind="article" record={draft.record} articles={state.articles} language={language} onClose={(options) => { setDraft(null); if (options?.reload) reload() }} onSaved={createdDraft} />}
  </div>
}
