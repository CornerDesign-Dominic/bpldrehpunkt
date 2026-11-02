import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import QualityEditor from '../components/quality/QualityEditor.jsx'
import { useLanguage } from '../i18n/useLanguage.js'
import { listDepartments } from '../lib/departments.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { EditIcon } from '../components/icons.jsx'
import QualityCycleRow from '../components/quality/QualityCycleRow.jsx'
import { getQualityTopic, listQualityHistory, listQualityMeetingsForTopic, listQualityRecords, saveQualityRecord } from '../lib/quality.js'
import { groupQualityCycles, PHASES, qualityOverviewUrl, qualityTopicUrl, qualityMeetingUrl, qualityValues } from '../lib/qualityPresentation.js'
import '../styles/quality.css'

function ProblemDetail({ topicId }) {
  const navigate = useNavigate()
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const { canEdit } = usePermissions()
  const editable = canEdit('kvp')
  const [searchParams] = useSearchParams()
  const phase = searchParams.get('phase')
  const [state, setState] = useState({ loading: true })
  const [reload, setReload] = useState(0)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [editor, setEditor] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const record = await getQualityTopic(topicId)
        if (!record) { if (active) setState({ loading: false, missing: true }); return }
        const [history, meetings, departments, topics] = await Promise.allSettled([
          listQualityHistory('topic', topicId), listQualityMeetingsForTopic(topicId),
          listDepartments(), listQualityRecords('topic', record.departmentId),
        ])
        let cycles
        let historyError = history.status === 'rejected'
        try { cycles = groupQualityCycles(record, history.status === 'fulfilled' ? history.value : []) }
        catch {
          historyError = true
          void reportTechnicalFailure({ module: 'kvp', stage: 'history', recordId: topicId, code: 'invalid-response' })
          cycles = groupQualityCycles(record)
        }
        if (departments.status === 'rejected') void reportTechnicalFailure({ module: 'kvp', stage: 'load', recordId: topicId, error: departments.reason })
        if (active) setState({
          loading: false, record, cycles, historyError,
          meetings: meetings.status === 'fulfilled' ? meetings.value : [], meetingError: meetings.status === 'rejected',
          departments: departments.status === 'fulfilled' ? departments.value : [], departmentError: departments.status === 'rejected',
          topics: topics.status === 'fulfilled' ? topics.value : [record], topicsError: topics.status === 'rejected',
        })
      } catch (error) {
        if (active) setState({ loading: false, error: true })
        if (error instanceof TypeError) void reportTechnicalFailure({ module: 'kvp', stage: 'load', recordId: topicId, code: 'invalid-response' })
      }
    }
    void load()
    return () => { active = false }
  }, [topicId, reload])

  useEffect(() => {
    if (!state.loading && PHASES.includes(phase)) document.getElementById(`quality-phase-${phase}`)?.focus()
  }, [phase, state.loading])

  function refresh() { setState({ loading: true }); setReload((value) => value + 1) }
  const backTo = qualityOverviewUrl(state.record?.departmentId || searchParams.get('department'))
  const back = <Link className="button button--secondary" to={backTo}>{text('Übersicht', 'Overview')}</Link>
  if (state.loading) return <div className="quality-page">{back}<p role="status">{text('Thema wird geladen …', 'Loading topic …')}</p></div>
  if (state.error) return <div className="quality-page">{back}<div className="form-error" role="alert"><p>{text('Das Thema konnte nicht geladen werden. Bitte Verbindung und Berechtigung prüfen.', 'The topic could not be loaded. Check your connection and permissions.')}</p><button className="button" onClick={refresh}>{text('Erneut versuchen', 'Retry')}</button></div></div>
  if (state.missing) return <div className="quality-page">{back}<h2>{text('Thema nicht gefunden', 'Topic not found')}</h2><p>{text('Bitte öffne den Vorgang erneut über die Abteilungsübersicht.', 'Please open the topic again from the department overview.')}</p></div>

  const { record, cycles, meetings, topics } = state
  const currentCycle = cycles.find((item) => item.cycle === record.cycle)
  const department = state.departments.find((item) => item.id === record.departmentId)
  const statusLabel = (value) => ({ active: text('Aktiv', 'Active'), paused: text('Pausiert', 'Paused'), completed: text('Abgeschlossen', 'Completed') }[value])
  const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(en ? 'en-GB' : 'de-DE') : '—'
  async function toggleCompleted() {
    setUpdatingStatus(true); setStatusError('')
    try { await saveQualityRecord('topic', record, { ...qualityValues('topic', record), status: record.status === 'completed' ? 'active' : 'completed' }); refresh() }
    catch (error) { setStatusError(error.code === 'functions/aborted' ? text('Das Thema wurde inzwischen geändert. Bitte neu laden.', 'This topic has changed. Please reload.') : text('Status konnte nicht gespeichert werden.', 'Status could not be saved.')) }
    finally { setUpdatingStatus(false) }
  }
  function editMeeting(meeting) { setEditor({ kind: 'meeting', record: meeting }) }

  return <div className="quality-page quality-detail">
    <div className="quality-heading">{back}<span className="quality-badge">{statusLabel(record.status)}</span></div>
    <header className="quality-topic-summary"><div><p className="quality-eyebrow">{department?.name || text('Abteilung nicht verfügbar', 'Department unavailable')}</p><h2>{record.title}</h2><div className="quality-inline"><span>{text('Zyklusstart', 'Cycle start')} · {formatDate(currentCycle.cycleStartDate)}</span>{editable && record.status !== 'completed' && <button className="quality-phase-edit" aria-label={text('Zyklusstart bearbeiten', 'Edit cycle start')} onClick={() => setEditor({ kind: 'topic', record, focusPhase: 'cycle' })}><EditIcon /></button>}</div></div>
      {editable && <div className="quality-inline"><button className="button button--secondary" disabled={updatingStatus} onClick={() => setEditor({ kind: 'topic', record })}>{text('Thema bearbeiten', 'Edit topic')}</button><button className="button" disabled={updatingStatus} onClick={toggleCompleted}>{record.status === 'completed' ? text('Wieder öffnen', 'Reopen') : text('Erledigt', 'Mark done')}</button></div>}
    </header>
    {statusError && <div className="form-error" role="alert">{statusError} <button className="button button--secondary" onClick={refresh}>{text('Neu laden', 'Reload')}</button></div>}
    {(state.historyError || state.meetingError || state.departmentError || state.topicsError) && <div className="form-error" role="alert"><p>{state.historyError && text('Die Durchlaufhistorie ist nicht vollständig verfügbar. ', 'Cycle history is not fully available. ')}{state.meetingError && text('Besprechungen konnten nicht geladen werden. ', 'Meetings could not be loaded. ')}{(state.departmentError || state.topicsError) && text('Abteilung oder zugehörige Probleme konnten nicht vollständig geladen werden. ', 'The department or related problems could not be fully loaded. ')}</p><button className="button button--secondary" onClick={refresh}>{text('Erneut laden', 'Reload')}</button></div>}
    {[...cycles].sort((a, b) => a.cycle - b.cycle).map((cycle) => <QualityCycleRow key={cycle.cycle} cycle={cycle} current={cycle.cycle === record.cycle} editable={editable && record.status !== 'completed' && !updatingStatus} language={language} onEdit={(section) => setEditor({ kind: 'topic', record, focusPhase: section })} />)}
    {editable && record.status !== 'completed' && <div className="quality-new-cycle"><button className="button button--secondary" disabled={state.historyError || updatingStatus} onClick={() => setEditor({ kind: 'topic', record, newCycle: true, focusPhase: 'cycle' })}>{text('Weiterer PDCA-Durchlauf', 'Add PDCA cycle')}</button></div>}
    <section className="quality-related-meetings" aria-labelledby="quality-meetings-title"><div className="quality-heading"><h3 id="quality-meetings-title">{text('Besprechungen', 'Meetings')}</h3>{editable && <button className="button button--secondary" disabled={state.topicsError || state.meetingError || !department?.active} onClick={() => editMeeting({ id: crypto.randomUUID(), departmentId: record.departmentId, topicIds: [topicId] })}>{text('Neue Besprechung', 'New meeting')}</button>}</div>{!state.meetingError && meetings.length === 0 && <p>{text('Keine Besprechungen.', 'No meetings.')}</p>}{meetings.map((meeting) => <details className="quality-meeting-detail" key={meeting.id}><summary>{formatDate(meeting.date)} · {meeting.title}</summary><p><strong>{text('Teilnehmer: ', 'Participants: ')}</strong>{meeting.participants || '—'}</p><p className="quality-protocol">{meeting.notes || text('Noch kein Protokolltext.', 'No minutes yet.')}</p><div className="quality-related-links"><strong>{text('Besprochene Themen', 'Topics discussed')}</strong>{meeting.topicIds.map((id) => id === topicId ? <span key={id}>{record.title}</span> : <Link key={id} to={qualityTopicUrl(id, { departmentId: record.departmentId })}>{topics.find((topic) => topic.id === id)?.title || text('Thema öffnen', 'Open topic')}</Link>)}</div><Link className="button button--secondary" to={qualityMeetingUrl(meeting.id, topicId)}>{text('Protokoll öffnen', 'Open minutes')}</Link></details>)}</section>
    {editor && <QualityEditor key={`${editor.record.id}-${editor.newCycle ? 'new' : 'edit'}`} {...editor} departmentId={record.departmentId} topics={topics} meetings={meetings} editable={editable} language={language} onClose={(options) => { setEditor(null); if (options?.reload) refresh() }} onSaved={(saved) => { if (editor.kind === 'meeting') navigate(qualityMeetingUrl(saved.id, topicId)); else { setEditor(null); refresh() } }} />}
  </div>
}

export default function QualityProblemDetailPage() {
  const { topicId } = useParams()
  return <ProblemDetail key={topicId} topicId={topicId} />
}
