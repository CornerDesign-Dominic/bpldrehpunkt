import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBusinessPartners } from '../lib/businessPartners.js'
import { listQualityOverview } from '../lib/qualityManagement.js'

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function formatValue(value, unit) {
  return value === null || value === undefined || value === '' ? '—' : `${value}${unit ? ` ${unit}` : ''}`
}

function dueClass(value) {
  if (!value) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${value}T12:00:00`)
  const diff = Math.round((due - today) / 86400000)
  return diff < 0 ? 'due-date due-date--overdue' : diff <= 7 ? 'due-date due-date--soon' : 'due-date'
}

function Section({ title, action, children }) {
  return <section className="qm-section"><div className="qm-section__heading"><h2>{title}</h2>{action}</div>{children}</section>
}

function Status({ children }) {
  return <span className="qm-status">{children || '—'}</span>
}

export default function QualityManagementPage() {
  const [overview, setOverview] = useState({ goals: [], measures: [], deviations: [], audits: [], improvements: [] })
  const [partners, setPartners] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listQualityOverview(), listBusinessPartners()])
      .then(([data, businessPartners]) => {
        setOverview(data)
        setPartners(Object.fromEntries(businessPartners.map((partner) => [partner.id, partner.companyName])))
      })
      .catch(() => setError('Die QM-Übersicht konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.'))
      .finally(() => setLoading(false))
  }, [])

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const openMeasures = overview.measures.filter((item) => item.status === 'Offen' || item.status === 'In Bearbeitung')
    const nextAudit = overview.audits.filter((item) => item.dueDate && item.dueDate >= today).at(0)
    return [
      { label: 'Aktive Qualitätsziele', value: overview.goals.filter((item) => item.status === 'Aktiv').length },
      { label: 'Offene Maßnahmen', value: openMeasures.length },
      { label: 'Überfällige Maßnahmen', value: overview.measures.filter((item) => item.status === 'Überfällig' || (item.dueDate && item.dueDate < today && item.status !== 'Erledigt')).length },
      { label: 'Offene Reklamationen', value: overview.deviations.filter((item) => item.status !== 'Erledigt').length },
      { label: 'Nächste Audits', value: nextAudit ? formatDate(nextAudit.dueDate) : '—' },
    ]
  }, [overview])

  return <div className="quality-management-page">
    <div className="qm-metrics">{metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>
    {error && <p className="form-error">{error}</p>}
    <Section title="Qualitätsziele" action={<Link className="button" to="/qm/ziele/neu">Ziel anlegen</Link>}>
      <div className="table-frame qm-table"><table><thead><tr><th>Ziel</th><th>Zeitraum / Jahr</th><th>Verantwortlich</th><th>Zielwert</th><th>Aktueller Stand</th><th>Status</th><th>Fälligkeit</th><th>Öffnen</th></tr></thead><tbody>{loading ? <tr><td colSpan="8" className="table-state">QM-Daten werden geladen …</td></tr> : overview.goals.length ? overview.goals.map((goal) => <tr key={goal.id}><td><strong>{goal.title}</strong></td><td>{goal.period || '—'}</td><td>{goal.responsible || '—'}</td><td>{formatValue(goal.targetValue, goal.unit)}</td><td>{formatValue(goal.currentValue, goal.unit)}</td><td><Status>{goal.status}</Status></td><td><span className={dueClass(goal.dueDate)}>{formatDate(goal.dueDate)}</span></td><td className="table-action"><Link to={`/qm/ziele/${goal.id}`}>Öffnen</Link></td></tr>) : <tr><td colSpan="8" className="table-state">Noch keine Qualitätsziele erfasst.</td></tr>}</tbody></table></div>
    </Section>
    <Section title="Maßnahmen">
      <div className="table-frame qm-table"><table><thead><tr><th>Maßnahme</th><th>Ursprung</th><th>Verantwortlich</th><th>Fälligkeit</th><th>Status</th><th>Öffnen</th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="table-state">QM-Daten werden geladen …</td></tr> : overview.measures.length ? overview.measures.map((item) => <tr key={item.id}><td><strong>{item.title || item.measure || '—'}</strong></td><td>{item.origin || '—'}</td><td>{item.responsible || '—'}</td><td><span className={dueClass(item.dueDate)}>{formatDate(item.dueDate)}</span></td><td><Status>{item.status}</Status></td><td className="table-action">—</td></tr>) : <tr><td colSpan="6" className="table-state">Noch keine Maßnahmen erfasst.</td></tr>}</tbody></table></div>
    </Section>
    <Section title="Reklamationen / Abweichungen">
      <div className="table-frame qm-table"><table><thead><tr><th>Datum</th><th>Geschäftspartner</th><th>Kategorie</th><th>Kurzbeschreibung</th><th>Verantwortlich</th><th>Status</th><th>Öffnen</th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="table-state">QM-Daten werden geladen …</td></tr> : overview.deviations.length ? overview.deviations.map((item) => <tr key={item.id}><td>{formatDate(item.date)}</td><td>{partners[item.partnerId] || '—'}</td><td>{item.category || '—'}</td><td>{item.description || item.title || '—'}</td><td>{item.responsible || '—'}</td><td><Status>{item.status}</Status></td><td className="table-action">—</td></tr>) : <tr><td colSpan="7" className="table-state">Noch keine Reklamationen oder Abweichungen erfasst.</td></tr>}</tbody></table></div>
    </Section>
    <Section title="Audits">
      <div className="table-frame qm-table"><table><thead><tr><th>Audit</th><th>Art</th><th>Datum</th><th>Verantwortlich</th><th>Status</th><th>Nächste Fälligkeit</th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="table-state">QM-Daten werden geladen …</td></tr> : overview.audits.length ? overview.audits.map((item) => <tr key={item.id}><td><strong>{item.title || item.audit || '—'}</strong></td><td>{item.type || '—'}</td><td>{formatDate(item.date)}</td><td>{item.responsible || '—'}</td><td><Status>{item.status}</Status></td><td><span className={dueClass(item.dueDate)}>{formatDate(item.dueDate)}</span></td></tr>) : <tr><td colSpan="6" className="table-state">Noch keine Audits erfasst.</td></tr>}</tbody></table></div>
    </Section>
    <Section title="Verbesserungen">
      <div className="table-frame qm-table"><table><thead><tr><th>Verbesserung</th><th>Art</th><th>Verantwortlich</th><th>Status</th><th>Öffnen</th></tr></thead><tbody>{loading ? <tr><td colSpan="5" className="table-state">QM-Daten werden geladen …</td></tr> : overview.improvements.length ? overview.improvements.map((item) => <tr key={item.id}><td><strong>{item.title || item.description || '—'}</strong></td><td>{item.type || '—'}</td><td>{item.responsible || '—'}</td><td><Status>{item.status}</Status></td><td className="table-action">—</td></tr>) : <tr><td colSpan="5" className="table-state">Noch keine Verbesserungen erfasst.</td></tr>}</tbody></table></div>
    </Section>
  </div>
}
