import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { KNOWLEDGE_PROCESS_CATEGORIES, KNOWLEDGE_PROCESS_STATUSES, categoryLabel, formatProcessDate, listKnowledgeProcesses, statusLabel } from '../lib/knowledgeProcesses.js'
import '../styles/knowledgeProcesses.css'

export default function KnowledgeProcessesPage() {
  const navigate = useNavigate()
  const { canEdit } = usePermissions()
  const editable = canEdit('knowledgeProcesses')
  const [processes, setProcesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let current = true
    listKnowledgeProcesses(editable).then((items) => { if (current) setProcesses(items) }).catch(() => { if (current) setError('Die Prozesse konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [editable])

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('de-DE')
    return processes.filter((process) => (!category || process.category === category) && (!status || process.status === status) && (!needle || `${process.title} ${process.shortDescription}`.toLocaleLowerCase('de-DE').includes(needle)))
  }, [category, processes, search, status])

  return <div className="knowledge-processes-page">
    <div className="knowledge-processes-toolbar">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Prozesse suchen …" aria-label="Prozesse suchen" />
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Kategorie filtern"><option value="">Alle Kategorien</option>{KNOWLEDGE_PROCESS_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      {editable && <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status filtern"><option value="">Alle Status</option>{KNOWLEDGE_PROCESS_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}
      {editable && <button className="button" type="button" onClick={() => navigate('/wissen-prozesse/neu')}>Prozess anlegen</button>}
    </div>
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="knowledge-processes-state">Prozesse werden geladen …</p> : visible.length === 0 ? <section className="knowledge-processes-empty"><h2>Keine Prozesse gefunden</h2><p>{editable ? 'Lege den ersten Prozess an oder passe die Filter an.' : 'Derzeit sind keine aktiven Prozesse verfügbar.'}</p></section> : <section className="knowledge-processes-table" aria-label="Prozessübersicht"><div className="knowledge-processes-table__head"><span>Titel</span><span>Kategorie</span><span>Status</span><span>Letzte Änderung</span><span>Verantwortlich</span></div>{visible.map((process) => <button type="button" className="knowledge-processes-table__row" key={process.id} onClick={() => navigate(`/wissen-prozesse/${process.id}`)}><strong>{process.title}</strong><span>{categoryLabel(process.category)}</span><span><i className={`process-status process-status--${process.status}`}>{statusLabel(process.status)}</i></span><span>{formatProcessDate(process.updatedAt)}</span><span>{process.updatedByName || process.createdByName || '—'}</span></button>)}</section>}
  </div>
}
