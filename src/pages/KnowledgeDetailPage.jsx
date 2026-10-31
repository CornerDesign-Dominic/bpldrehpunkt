import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../i18n/useLanguage.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getKnowledge, listKnowledge } from '../lib/knowledge.js'
import { knowledgeBaseUrl, knowledgeLabels, knowledgeOverdue, knowledgeSections, knowledgeUrl } from '../lib/knowledgePresentation.js'
import { EditIcon } from '../components/icons.jsx'
import { useQualityToday } from '../components/quality/useQualityToday.js'
import KnowledgeEditor from '../components/quality/KnowledgeEditor.jsx'
import KnowledgeHistory from '../components/quality/KnowledgeHistory.jsx'
import '../styles/quality.css'
import '../styles/knowledge.css'

function Detail({ kind, entryId }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const label = (key) => knowledgeLabels[key]?.[en ? 1 : 0] || key
  const { canEdit } = usePermissions()
  const editable = canEdit('handbook')
  const [params] = useSearchParams()
  const [state, setState] = useState({ loading: true })
  const [retry, setRetry] = useState(0)
  const [editor, setEditor] = useState(null)
  const [history, setHistory] = useState(() => Number(params.get('revision')) > 0)
  const today = useQualityToday()
  useEffect(() => {
    let active = true
    Promise.all([getKnowledge(kind, entryId), listKnowledge('rule'), kind === 'article' ? listKnowledge('article') : Promise.resolve([])]).then(([record, rules, articles]) => { if (active) setState({ loading: false, record, rules, articles }) }).catch(() => { if (active) setState({ loading: false, error: true }) })
    return () => { active = false }
  }, [kind, entryId, retry])
  function reload() { setState({ loading: true }); setRetry((value) => value + 1) }
  const back = <Link className="button button--secondary" to={`${knowledgeBaseUrl(kind)}${params.has('catalog') ? `?${new URLSearchParams(params.get('catalog'))}` : ''}`}>{text('Katalog', 'Catalog')}</Link>
  if (state.loading) return <div className="quality-page">{back}<p role="status">{text('Wird geladen …', 'Loading …')}</p></div>
  if (state.error) return <div className="quality-page">{back}<p role="alert" className="form-error">{text('Eintrag konnte nicht geladen werden.', 'Entry could not be loaded.')}</p><button className="button" onClick={reload}>{text('Erneut versuchen', 'Retry')}</button></div>
  if (!state.record) return <div className="quality-page">{back}<p>{text('Eintrag nicht gefunden.', 'Entry not found.')}</p></div>
  const { record, rules, articles } = state
  const editButton = (section, name) => editable && <button className="quality-phase-edit" aria-label={`${name} ${text('bearbeiten', 'edit')}`} onClick={() => setEditor(section)}><EditIcon /></button>
  return <div className="quality-page quality-detail knowledge-page"><div className="quality-heading">{back}<div className="quality-inline"><span className="quality-badge">{label(record.status)}</span>{editable && <button className="button" onClick={() => setEditor('metadata')}>{text('Bearbeiten', 'Edit')}</button>}</div></div>
    <header className="quality-problem-heading"><p className="quality-eyebrow">{kind === 'article' ? [record.process, record.topic].filter(Boolean).join(' · ') : label(record.audience)}</p><h2>{record.title}</h2></header>
    <div className="quality-handbook-sections">{knowledgeSections(kind).map((section) => <section className="quality-phase-panel" key={section}><header><h3>{label(section)}</h3>{editButton(section, label(section))}</header><p className="quality-protocol">{record[section] || '—'}</p></section>)}</div>
    {kind === 'article' && <section className="quality-phase-panel knowledge-related-rules"><header><h3>{text('Grundregeln', 'Ground rules')}</h3>{editButton('rules', text('Grundregeln', 'Ground rules'))}</header><div className="quality-related-links">{!record.ruleIds?.length && <span>—</span>}{record.ruleIds?.map((id) => { const rule = rules.find((item) => item.id === id); return <Link key={id} to={knowledgeUrl('rule', id)}>{rule?.title || text('Nicht verfügbar', 'Unavailable')}{rule ? ` · ${label(rule.status)}` : ''}</Link> })}</div></section>}
    <section className={`quality-phase-panel quality-handbook-review${knowledgeOverdue(record, today) ? ' quality-review--overdue' : ''}`}><header><h3>{text('Stand & Kontrolle', 'Status & review')}</h3>{editButton('review', text('Stand & Kontrolle', 'Status & review'))}</header><dl>{[
      [text('Zuletzt bearbeitet', 'Last edited'), record.updatedAt?.toDate?.().toLocaleString(en ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin' }) || '—'],
      [text('Bearbeitet von', 'Edited by'), record.updatedByName || '—'], [label('owner'), record.owner || '—'], [label('lastReviewedDate'), record.lastReviewedDate || '—'], [label('nextReviewDate'), record.nextReviewDate || '—'],
    ].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>{knowledgeOverdue(record, today) && <span className="quality-overdue-badge">{text('Prüfung überfällig', 'Review overdue')}</span>}<div><button className="quality-history-link" onClick={() => setHistory(true)}>{text('Revisionshistorie', 'Revision history')}</button></div></section>
    {editor && <KnowledgeEditor kind={kind} record={record} section={editor} rules={rules} articles={articles} language={language} onClose={(options) => { setEditor(null); if (options?.reload) reload() }} onSaved={() => { setEditor(null); reload() }} />}
    {history && <KnowledgeHistory kind={kind} record={record} rules={rules} language={language} requestedRevision={Number(params.get('revision')) || undefined} onClose={() => setHistory(false)} />}
  </div>
}
export default function KnowledgeDetailPage({ kind = 'article' }) { const { entryId } = useParams(); return <Detail key={`${kind}-${entryId}`} kind={kind} entryId={entryId} /> }
