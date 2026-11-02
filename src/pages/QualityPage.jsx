import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/useLanguage.js'
import { usePermissions } from '../auth/usePermissions.js'
import { listDepartments } from '../lib/departments.js'
import { listQualityRecords } from '../lib/quality.js'
import { PHASES, qualityTopicUrl, qualityHandbookUrl, qualityMeetingUrl, searchQualityRecords, isQualityReviewOverdue } from '../lib/qualityPresentation.js'
import { useQualityToday } from '../components/quality/useQualityToday.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import QualityEditor from '../components/quality/QualityEditor.jsx'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import '../styles/quality.css'

export default function QualityPage({ handbook = false }) {
  const { language } = useLanguage()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const module = handbook ? 'handbook' : 'kvp'
  const { canEdit } = usePermissions()
  const editable = canEdit(module)
  const [departments, setDepartments] = useState([])
  const [departmentId, setDepartmentId] = useState(() => searchParams.get('department') || '')
  const [records, setRecords] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [tab, setTab] = useState(() => searchParams.get('view') === 'meetings' ? 'meetings' : 'topics')
  const [editor, setEditor] = useState(null)
  const [reload, setReload] = useState(0)
  const [departmentRetry, setDepartmentRetry] = useState(0)
  const today = useQualityToday()

  useEffect(() => {
    let active = true
    listDepartments().then((items) => { if (active) { setDepartments(items); setDepartmentId((previous) => (items.some((item) => item.id === previous) ? previous : '') || items.find((item) => item.active)?.id || items[0]?.id || ''); if (!items.length) setLoading(false); setError('') } }).catch((failure) => { if (active) { setError('departments'); setLoading(false) } void reportTechnicalFailure({ module, stage: 'load', error: failure }) })
    return () => { active = false }
  }, [module, departmentRetry])

  useEffect(() => {
    if (!departmentId) return undefined
    let active = true
    Promise.all([listQualityRecords(handbook ? 'handbook' : 'topic', departmentId), handbook ? Promise.resolve([]) : listQualityRecords('meeting', departmentId)])
      .then(([items, minutes]) => { if (active) { setRecords(items); setMeetings(minutes); setError(''); setLoading(false) } })
      .catch(() => { if (active) { setError('records'); setLoading(false) } })
    return () => { active = false }
  }, [departmentId, handbook, reload])

  function open(kind, record = {}, focusPhase) { setEditor({ kind, record: { ...record, id: record.id || crypto.randomUUID() }, focusPhase }) }
  const visible = searchQualityRecords(handbook || tab === 'topics' ? records : meetings, search).filter((item) => handbook || tab !== 'topics' || status === 'all' || item.status === status)
  const groups = handbook ? [...new Set(visible.map((item) => item.process))].sort((a, b) => a.localeCompare(b)) : []
  const selectedDepartment = departments.find((item) => item.id === departmentId)

  return <div className="quality-page">
    <div className="quality-toolbar"><label className="form-field"><span>{text('Abteilung', 'Department')}</span><select value={departmentId} disabled={loading && !departments.length} onChange={(event) => { setSearchParams({ department: event.target.value }, { replace: true }); setDepartmentId(event.target.value); setRecords([]); setMeetings([]); setLoading(true); setError('') }}>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : text(' (inaktiv)', ' (inactive)')}</option>)}</select></label><label className="form-field quality-search"><span>{text('Suche', 'Search')}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text('Suchen …', 'Search …')} /></label>{!handbook && tab === 'topics' && <label className="form-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{text('Alle', 'All')}</option><option value="active">{text('Aktiv', 'Active')}</option><option value="paused">{text('Pausiert', 'Paused')}</option><option value="completed">{text('Abgeschlossen', 'Completed')}</option></select></label>}{editable && <button className="button" disabled={!selectedDepartment?.active || loading || Boolean(error)} onClick={() => open(handbook ? 'handbook' : tab === 'topics' ? 'topic' : 'meeting')}>{handbook ? text('Eintrag hinzufügen', 'Add entry') : tab === 'topics' ? text('Thema anlegen', 'Add topic') : text('Besprechung hinzufügen', 'Add meeting')}</button>}</div>
    {!handbook && <div className="quality-tabs" role="group" aria-label={text('Ansicht', 'View')}><button type="button" aria-pressed={tab === 'topics'} onClick={() => setTab('topics')}>{text('PDCA-Übersicht', 'PDCA overview')}</button><button type="button" aria-pressed={tab === 'meetings'} onClick={() => setTab('meetings')}>{text('Besprechungen', 'Meetings')} ({meetings.length})</button></div>}
    {loading ? <p role="status">{text('Wird geladen …', 'Loading …')}</p> : error ? <div className="form-error" role="alert"><p>{text('Die Daten konnten nicht geladen werden. Bitte Verbindung und Berechtigung prüfen.', 'Data could not be loaded. Check your connection and permissions.')}</p><button type="button" className="button button--secondary" onClick={() => { setLoading(true); if (error === 'departments') setDepartmentRetry((value) => value + 1); else setReload((value) => value + 1) }}>{text('Erneut versuchen', 'Retry')}</button></div> : !departmentId ? <p>{text('Noch keine Abteilung hinterlegt. Bitte in der zentralen Abteilungsverwaltung anlegen.', 'No department available. Please create one in department administration.')}</p> : <>
      {visible.length === 0 && <p className="quality-empty">{search || status !== 'all' ? text('Keine passenden Einträge.', 'No matching entries.') : text('Noch keine Einträge für diese Abteilung.', 'No entries for this department yet.')}</p>}
      {!handbook && tab === 'topics' && visible.length > 0 && <div className="quality-board-scroll"><table className="quality-board"><thead><tr>{PHASES.map((phase) => <th key={phase} scope="col">{phase.toUpperCase()}</th>)}</tr></thead><tbody>{visible.map((topic) => <tr key={topic.id}>{PHASES.map((phase, index) => <td key={phase}><Link className="quality-cell" to={qualityTopicUrl(topic.id, { departmentId, phase })}>{index === 0 && <><strong>{topic.title}</strong><small>{text('Durchlauf', 'Cycle')} {topic.cycle} · {text({ active: 'Aktiv', paused: 'Pausiert', completed: 'Abgeschlossen' }[topic.status], { active: 'Active', paused: 'Paused', completed: 'Completed' }[topic.status])}</small></>}{phase === 'act' && topic.actDecision && <small>{({ correct: text('Korrigieren', 'Correct'), discard: text('Verwerfen', 'Discard'), establish: text('Etablieren', 'Standardize') })[topic.actDecision]}{topic.actDate ? ` · ${topic.actDate}` : ''}</small>}<p>{topic[phase] || (phase === 'act' && topic.actDecision ? '' : '—')}</p>{phase === 'plan' && topic.goal && <p><b>{text('Ziel: ', 'Goal: ')}</b>{topic.goal}</p>}{phase === 'do' && <small>{[topic.owner, topic.startDate, topic.dueDate].filter(Boolean).join(' · ')}</small>}</Link></td>)}</tr>)}</tbody></table></div>}
      {!handbook && tab === 'meetings' && <div className="quality-cards">{[...visible].sort((a, b) => b.date.localeCompare(a.date)).map((meeting) => <Link className="quality-card" key={meeting.id} to={qualityMeetingUrl(meeting.id)}><small>{meeting.date} · {meeting.participants}</small><h3>{meeting.title}</h3><p>{meeting.notes}</p><small>{text('Themen: ', 'Topics: ')}{meeting.topicIds.map((id) => records.find((topic) => topic.id === id)?.title || text('Nicht verfügbar', 'Unavailable')).join(', ')}</small></Link>)}</div>}
      {handbook && groups.map((process) => <section key={process} className="quality-process"><h3>{process}</h3><div className="quality-cards">{visible.filter((item) => item.process === process).map((item) => <Link className={`quality-card${isQualityReviewOverdue(item, today) ? ' quality-review--overdue' : ''}`} key={item.id} to={qualityHandbookUrl(item.id)}><h4>{item.title}</h4><p>{item.situation}</p>{item.owner && <small>{text('Zuständig: ', 'Responsible: ')}{item.owner}</small>}{isQualityReviewOverdue(item, today) && <div><span className="quality-overdue-badge">{text('Kontrolle überfällig', 'Review overdue')}</span></div>}</Link>)}</div></section>)}
    </>}
    {editor && <QualityEditor key={editor.record.id} {...editor} departmentId={departmentId} topics={records} meetings={meetings} editable={editable} language={language} onClose={(options) => { setEditor(null); if (options?.reload) { setLoading(true); setReload((value) => value + 1) } }} onSaved={(saved) => { if (editor.kind === 'topic') navigate(qualityTopicUrl(saved.id)); else if (editor.kind === 'handbook') navigate(qualityHandbookUrl(saved.id)); else navigate(qualityMeetingUrl(saved.id)) }} />}
  </div>
}
