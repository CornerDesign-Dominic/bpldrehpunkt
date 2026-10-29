import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import QualityEditor from '../components/quality/QualityEditor.jsx'
import { useLanguage } from '../i18n/useLanguage.js'
import { listDepartments } from '../lib/departments.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { EditIcon } from '../components/icons.jsx'
import { getQualityTopic, listQualityHistory, listQualityMeetingsForTopic, listQualityRecords } from '../lib/quality.js'
import { groupQualityCycles, PHASES, qualityOverviewUrl, qualityTopicUrl } from '../lib/qualityPresentation.js'
import '../styles/quality.css'

function ProblemDetail({ topicId }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const { canEdit } = usePermissions()
  const editable = canEdit('kvp')
  const [searchParams] = useSearchParams()
  const phase = searchParams.get('phase')
  const [state, setState] = useState({ loading: true })
  const [reload, setReload] = useState(0)
  const [selectedCycle, setSelectedCycle] = useState(null)
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
  if (state.loading) return <div className="quality-page">{back}<p role="status">{text('Problemvorgang wird geladen …', 'Loading problem …')}</p></div>
  if (state.error) return <div className="quality-page">{back}<div className="form-error" role="alert"><p>{text('Der Problemvorgang konnte nicht geladen werden. Bitte Verbindung und Berechtigung prüfen.', 'The problem could not be loaded. Check your connection and permissions.')}</p><button className="button" onClick={refresh}>{text('Erneut versuchen', 'Retry')}</button></div></div>
  if (state.missing) return <div className="quality-page">{back}<h2>{text('Problemvorgang nicht gefunden', 'Problem not found')}</h2><p>{text('Bitte öffne den Vorgang erneut über die Abteilungsübersicht.', 'Please open the problem again from the department overview.')}</p></div>

  const { record, cycles, meetings, topics } = state
  const cycle = cycles.find((item) => item.cycle === selectedCycle) || cycles.find((item) => item.cycle === record.cycle)
  const current = cycle.cycle === record.cycle
  const department = state.departments.find((item) => item.id === record.departmentId)
  const statusLabel = (value) => ({ active: text('Aktiv', 'Active'), paused: text('Pausiert', 'Paused'), completed: text('Abgeschlossen', 'Completed') }[value])
  const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(en ? 'en-GB' : 'de-DE') : '—'
  function editMeeting(meeting) { setEditor({ kind: 'meeting', record: meeting }) }

  return <div className="quality-page quality-detail">
    <div className="quality-heading">{back}<span className="quality-badge">{statusLabel(record.status)}</span></div>
    <header className="quality-problem-heading"><p className="quality-eyebrow">{department?.name || text('Abteilung nicht verfügbar', 'Department unavailable')}</p><h2>{record.title}</h2></header>
    <section className="quality-cycle-bar" aria-label={text('PDCA-Durchläufe', 'PDCA cycles')}>
      <label className="form-field"><span>{text('PDCA-Durchlauf', 'PDCA cycle')}</span><select value={cycle.cycle} onChange={(event) => setSelectedCycle(Number(event.target.value))}>{cycles.map((item) => <option key={item.cycle} value={item.cycle}>{text('Durchlauf', 'Cycle')} {item.cycle}{item.cycle === record.cycle ? text(' · aktuell', ' · current') : ''}</option>)}</select></label>
      {!current && <span className="quality-badge">{text('Nur lesbar', 'Read only')}</span>}
      {editable && <div className="quality-inline">{current && <button className="button" onClick={() => setEditor({ kind: 'topic', record, focusPhase: PHASES.includes(phase) ? phase : 'plan' })}>{text('Bearbeiten', 'Edit')}</button>}<button className="button button--secondary" disabled={!current || state.historyError} onClick={() => setEditor({ kind: 'topic', record, newCycle: true, focusPhase: 'plan' })}>{text('Neuer Durchlauf', 'New cycle')}</button></div>}
    </section>
    {(state.historyError || state.meetingError || state.departmentError || state.topicsError) && <div className="form-error" role="alert"><p>{state.historyError && text('Die Durchlaufhistorie ist nicht vollständig verfügbar. ', 'Cycle history is not fully available. ')}{state.meetingError && text('Besprechungen konnten nicht geladen werden. ', 'Meetings could not be loaded. ')}{(state.departmentError || state.topicsError) && text('Abteilung oder zugehörige Probleme konnten nicht vollständig geladen werden. ', 'The department or related problems could not be fully loaded. ')}</p><button className="button button--secondary" onClick={refresh}>{text('Erneut laden', 'Reload')}</button></div>}
    <section className="quality-goal-summary" aria-labelledby="quality-goal-title"><h3 id="quality-goal-title" className="sr-only">{text('Ziel', 'Goal')}</h3><dl><div><dt>{text('SMART-Ziel', 'SMART goal')}</dt><dd>{cycle.goal || text('Noch nicht festgelegt', 'Not set yet')}</dd></div><div><dt>{text('Messkriterium', 'Measurement')}</dt><dd>{cycle.measure || '—'}</dd></div><div><dt>{text('Verantwortlich', 'Responsible')}</dt><dd>{cycle.owner || '—'}</dd></div><div><dt>{text('Zeitraum', 'Time frame')}</dt><dd>{formatDate(cycle.startDate)} – {formatDate(cycle.dueDate)}</dd></div></dl></section>
    <div className="quality-phase-grid">{PHASES.map((name) => <section key={name} id={`quality-phase-${name}`} className="quality-phase-panel" tabIndex={-1} aria-labelledby={`quality-phase-title-${name}`}><header><h3 id={`quality-phase-title-${name}`}>{name.toUpperCase()}</h3>{editable && current && <button className="quality-phase-edit" aria-label={`${name.toUpperCase()} ${text('bearbeiten', 'edit')}`} title={text('Bearbeiten', 'Edit')} onClick={() => setEditor({ kind: 'topic', record, focusPhase: name })}><EditIcon /></button>}</header><p className="quality-protocol">{cycle[name] || '—'}</p></section>)}</div>
    <section className="quality-related-meetings" aria-labelledby="quality-meetings-title"><div className="quality-heading"><h3 id="quality-meetings-title">{text('Besprechungen', 'Meetings')}</h3>{editable && <button className="button button--secondary" disabled={state.topicsError || state.meetingError || !department?.active} onClick={() => editMeeting({ id: crypto.randomUUID(), departmentId: record.departmentId, topicIds: [topicId] })}>{text('Neue Besprechung', 'New meeting')}</button>}</div>{!state.meetingError && meetings.length === 0 && <p>{text('Keine Besprechungen.', 'No meetings.')}</p>}{meetings.map((meeting) => <details className="quality-meeting-detail" key={meeting.id}><summary>{formatDate(meeting.date)} · {meeting.title}</summary><p><strong>{text('Teilnehmer: ', 'Participants: ')}</strong>{meeting.participants || '—'}</p><p className="quality-protocol">{meeting.notes || text('Noch kein Protokolltext.', 'No minutes yet.')}</p><div className="quality-related-links"><strong>{text('Besprochene Probleme', 'Problems discussed')}</strong>{meeting.topicIds.map((id) => id === topicId ? <span key={id}>{record.title}</span> : <Link key={id} to={qualityTopicUrl(id, { departmentId: record.departmentId })}>{topics.find((topic) => topic.id === id)?.title || text('Problem öffnen', 'Open problem')}</Link>)}</div>{editable && <button className="button button--secondary" disabled={state.topicsError} onClick={() => editMeeting(meeting)}>{text('Protokoll bearbeiten', 'Edit minutes')}</button>}</details>)}</section>
    {editor && <QualityEditor key={`${editor.record.id}-${editor.newCycle ? 'new' : 'edit'}`} {...editor} departmentId={record.departmentId} topics={topics} meetings={meetings} editable={editable} language={language} onClose={(options) => { setEditor(null); if (options?.reload) refresh() }} onSaved={() => { setEditor(null); setSelectedCycle(null); refresh() }} />}
  </div>
}

export default function QualityProblemDetailPage() {
  const { topicId } = useParams()
  return <ProblemDetail key={topicId} topicId={topicId} />
}
