import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { EditIcon } from '../components/icons.jsx'
import QualityEditor from '../components/quality/QualityEditor.jsx'
import { listDepartments } from '../lib/departments.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { getQualityMeeting, listQualityRecords } from '../lib/quality.js'
import { qualityMeetingsOverviewUrl, qualityTopicUrl } from '../lib/qualityPresentation.js'
import '../styles/quality.css'

function MeetingDetail({ meetingId }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const { canEdit } = usePermissions()
  const editable = canEdit('kvp')
  const [searchParams] = useSearchParams()
  const returnTopic = searchParams.get('topic')
  const [state, setState] = useState({ loading: true })
  const [reload, setReload] = useState(0)
  const [editor, setEditor] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const record = await getQualityMeeting(meetingId)
        if (!record) { if (active) setState({ loading: false, missing: true }); return }
        const [departments, topics] = await Promise.allSettled([listDepartments(), listQualityRecords('topic', record.departmentId)])
        if (departments.status === 'rejected') void reportTechnicalFailure({ module: 'kvp', stage: 'load', recordId: meetingId, error: departments.reason })
        if (active) setState({ loading: false, record,
          department: departments.status === 'fulfilled' ? departments.value.find((item) => item.id === record.departmentId) : null,
          departmentError: departments.status === 'rejected',
          topics: topics.status === 'fulfilled' ? topics.value : [], topicsError: topics.status === 'rejected',
        })
      } catch { if (active) setState({ loading: false, error: true }) }
    }
    void load()
    return () => { active = false }
  }, [meetingId, reload])

  function refresh() { setState({ loading: true }); setReload((value) => value + 1) }
  const back = <Link className="button button--secondary" to={returnTopic ? qualityTopicUrl(returnTopic) : qualityMeetingsOverviewUrl(state.record?.departmentId)}>{returnTopic ? text('Zum Thema', 'Back to topic') : text('Besprechungen', 'Meetings')}</Link>
  if (state.loading) return <div className="quality-page">{back}<p role="status">{text('Wird geladen …', 'Loading …')}</p></div>
  if (state.missing) return <div className="quality-page">{back}<h2>{text('Besprechung nicht gefunden', 'Meeting not found')}</h2></div>
  if (state.error) return <div className="quality-page">{back}<p className="form-error" role="alert">{text('Besprechung konnte nicht geladen werden.', 'Meeting could not be loaded.')}</p><button className="button" onClick={refresh}>{text('Erneut versuchen', 'Retry')}</button></div>
  const { record, department, topics, topicsError, departmentError } = state
  const date = new Date(`${record.date}T12:00:00`).toLocaleDateString(en ? 'en-GB' : 'de-DE')
  function editButton(section, label, disabled = false) {
    return editable && <button className="quality-phase-edit" disabled={disabled} aria-label={`${label} ${text('bearbeiten', 'edit')}`} title={text('Bearbeiten', 'Edit')} onClick={() => setEditor({ focusPhase: section })}><EditIcon /></button>
  }
  return <div className="quality-page quality-detail">
    <div className="quality-heading">{back}{editable && <button className="button" onClick={() => setEditor({})}>{text('Besprechung bearbeiten', 'Edit meeting')}</button>}</div>
    <header className="quality-problem-heading"><p className="quality-eyebrow">{department?.name || text('Abteilung nicht verfügbar', 'Department unavailable')} · {date}</p><h2>{record.title}</h2></header>
    {(topicsError || departmentError) && <div className="form-error" role="alert"><p>{text('Themen oder Abteilung konnten nicht vollständig geladen werden.', 'Topics or department could not be fully loaded.')}</p><button className="button button--secondary" onClick={refresh}>{text('Erneut versuchen', 'Retry')}</button></div>}
    <div className="quality-meeting-grid">
      <section className="quality-phase-panel quality-meeting-notes" aria-labelledby="meeting-notes"><header><h3 id="meeting-notes">{text('Protokoll', 'Minutes')}</h3>{editButton('notes', text('Protokoll', 'Minutes'))}</header><p className="quality-protocol">{record.notes || '—'}</p></section>
      <div className="quality-meeting-side">
        <section className="quality-phase-panel" aria-labelledby="meeting-participants"><header><h3 id="meeting-participants">{text('Teilnehmer', 'Participants')}</h3>{editButton('participants', text('Teilnehmer', 'Participants'))}</header><p className="quality-protocol">{record.participants || '—'}</p></section>
        <section className="quality-phase-panel" aria-labelledby="meeting-topics"><header><h3 id="meeting-topics">{text('Themen', 'Topics')} ({record.topicIds.length})</h3>{editButton('topics', text('Themen', 'Topics'), topicsError)}</header><div className="quality-related-links">{record.topicIds.map((id) => <Link key={id} to={qualityTopicUrl(id, { departmentId: record.departmentId })}>{topics.find((topic) => topic.id === id)?.title || text('Thema öffnen', 'Open topic')}</Link>)}{record.topicIds.length === 0 && <span>—</span>}</div></section>
      </div>
    </div>
    {editor && <QualityEditor key={editor.focusPhase || 'metadata'} kind="meeting" record={record} {...editor} departmentId={record.departmentId} topics={topics} editable={editable} language={language} onClose={(options) => { setEditor(null); if (options?.reload) refresh() }} onSaved={() => { setEditor(null); refresh() }} />}
  </div>
}

export default function QualityMeetingDetailPage() {
  const { meetingId } = useParams()
  return <MeetingDetail key={meetingId} meetingId={meetingId} />
}
