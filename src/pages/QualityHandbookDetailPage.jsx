import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { EditIcon } from '../components/icons.jsx'
import QualityEditor from '../components/quality/QualityEditor.jsx'
import { listDepartments } from '../lib/departments.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { getQualityHandbook } from '../lib/quality.js'
import { HANDBOOK_SECTIONS, qualityHandbookOverviewUrl, isQualityReviewOverdue } from '../lib/qualityPresentation.js'
import { useQualityToday } from '../components/quality/useQualityToday.js'
import '../styles/quality.css'

const sectionLabels = {
  situation: ['Situation', 'Situation'], consequences: ['Folgen', 'Consequences'],
  action: ['Vorgehen', 'Action'], prevention: ['Vorbeugung', 'Prevention'],
}

function HandbookDetail({ entryId }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const { canEdit } = usePermissions()
  const editable = canEdit('handbook')
  const today = useQualityToday()
  const [state, setState] = useState({ loading: true })
  const [reload, setReload] = useState(0)
  const [editor, setEditor] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const record = await getQualityHandbook(entryId)
        if (!record) { if (active) setState({ loading: false, missing: true }); return }
        let department = null
        let departmentError = false
        try { department = (await listDepartments()).find((item) => item.id === record.departmentId) }
        catch (error) {
          departmentError = true
          void reportTechnicalFailure({ module: 'handbook', stage: 'load', recordId: entryId, error })
        }
        if (active) setState({ loading: false, record, department, departmentError })
      } catch { if (active) setState({ loading: false, error: true }) }
    }
    void load()
    return () => { active = false }
  }, [entryId, reload])

  function refresh() { setState({ loading: true }); setReload((value) => value + 1) }
  const back = <Link className="button button--secondary" to={qualityHandbookOverviewUrl(state.record?.departmentId)}>{text('Übersicht', 'Overview')}</Link>
  if (state.loading) return <div className="quality-page">{back}<p role="status">{text('Wird geladen …', 'Loading …')}</p></div>
  if (state.missing) return <div className="quality-page">{back}<h2>{text('Eintrag nicht gefunden', 'Entry not found')}</h2></div>
  if (state.error) return <div className="quality-page">{back}<p className="form-error" role="alert">{text('Eintrag konnte nicht geladen werden.', 'Entry could not be loaded.')}</p><button className="button" onClick={refresh}>{text('Erneut versuchen', 'Retry')}</button></div>
  const { record, department, departmentError } = state
  const overdue = isQualityReviewOverdue(record, today)
  return <div className="quality-page quality-detail">
    <div className="quality-heading">{back}{editable && <button className="button" onClick={() => setEditor({})}>{text('Eintrag bearbeiten', 'Edit entry')}</button>}</div>
    <header className="quality-problem-heading"><p className="quality-eyebrow">{department?.name || text('Abteilung nicht verfügbar', 'Department unavailable')} · {record.process}</p><h2>{record.title}</h2></header>
    {departmentError && <div className="form-error" role="alert"><span>{text('Abteilung konnte nicht geladen werden.', 'Department could not be loaded.')} </span><button className="button button--secondary" onClick={refresh}>{text('Erneut versuchen', 'Retry')}</button></div>}
    <div className="quality-handbook-sections">{HANDBOOK_SECTIONS.map((section) => <section className="quality-phase-panel" key={section} aria-labelledby={`handbook-${section}`}><header><h3 id={`handbook-${section}`}>{sectionLabels[section][en ? 1 : 0]}</h3>{editable && <button className="quality-phase-edit" aria-label={`${sectionLabels[section][en ? 1 : 0]} ${text('bearbeiten', 'edit')}`} title={text('Bearbeiten', 'Edit')} onClick={() => setEditor({ focusPhase: section })}><EditIcon /></button>}</header><p className="quality-protocol">{record[section] || '—'}</p></section>)}</div>
    <section className={`quality-phase-panel quality-handbook-review${overdue ? ' quality-review--overdue' : ''}`} aria-labelledby="handbook-review">
      <header><h3 id="handbook-review">{text('Revision & Kontrolle', 'Revision & review')}</h3><div className="quality-inline">{overdue && <span className="quality-overdue-badge">{text('Kontrolle überfällig', 'Review overdue')}</span>}{editable && <button className="quality-phase-edit" aria-label={text('Zuständigkeit und Kontrolltermine bearbeiten', 'Edit responsibility and review dates')} title={text('Bearbeiten', 'Edit')} onClick={() => setEditor({ focusPhase: 'review' })}><EditIcon /></button>}</div></header>
      <dl>{[
        [text('Revision', 'Revision'), record.revision],
        [text('Zuletzt bearbeitet am', 'Last edited'), record.updatedAt?.toDate?.().toLocaleString(en ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' })],
        [text('Bearbeitet von', 'Edited by'), record.updatedByName],
        [text('Zuständig', 'Responsible'), record.owner],
        [text('Zuletzt kontrolliert', 'Last reviewed'), record.lastReviewedDate && new Date(`${record.lastReviewedDate}T12:00:00`).toLocaleDateString(en ? 'en-GB' : 'de-DE')],
        [text('Nächste Kontrolle', 'Next review'), record.nextReviewDate && new Date(`${record.nextReviewDate}T12:00:00`).toLocaleDateString(en ? 'en-GB' : 'de-DE')],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
    </section>
    {editor && <QualityEditor key={editor.focusPhase || 'metadata'} kind="handbook" record={record} {...editor} departmentId={record.departmentId} editable={editable} language={language} onClose={(options) => { setEditor(null); if (options?.reload) refresh() }} onSaved={() => { setEditor(null); refresh() }} />}
  </div>
}

export default function QualityHandbookDetailPage() {
  const { entryId } = useParams()
  return <HandbookDetail key={entryId} entryId={entryId} />
}
