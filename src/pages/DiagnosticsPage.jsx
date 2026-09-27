import { useEffect, useState } from 'react'
import { listManagedUserProfiles } from '../lib/userProfiles.js'
import { DIAGNOSTIC_MODULE_LABELS, listDiagnosticsPage } from '../lib/diagnostics.js'
import '../styles/admin.css'

const dateFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const initialFilters = { module: '', actorId: '', from: '', to: '' }
const stageLabels = {
  preparation: 'Vorbereitung', configuration: 'Konfiguration', geocoding_origin: 'Geocoding Start',
  geocoding_destination: 'Geocoding Ziel', routing: 'Routing', load: 'Laden',
  save: 'Speichern', preview: 'Vorschau', dashboard: 'Dashboard', 'transport-orders': 'Transportaufträge',
  partners: 'Partner', crm: 'CRM', administration: 'Administration', other: 'Sonstige Seite',
  'personal-signature-load': 'Persönliche Unterschrift laden', 'company-stamp-load': 'Firmenstempel laden', 'pdf-create': 'PDF erstellen',
}

function dateBoundary(day, nextDay = false) {
  if (!day) return ''
  const date = new Date(`${day}T00:00:00`)
  if (nextDay) date.setDate(date.getDate() + 1)
  return date.toISOString()
}

function displayUser(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || user.id
}

export default function DiagnosticsPage() {
  const [filters, setFilters] = useState(initialFilters)
  const [pagination, setPagination] = useState({ cursors: [null], page: 0 })
  const [refreshKey, setRefreshKey] = useState(0)
  const [users, setUsers] = useState([])
  const [entries, setEntries] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listManagedUserProfiles().then(setUsers).catch(() => setUsers([]))
  }, [])

  useEffect(() => {
    let current = true
    const from = dateBoundary(filters.from)
    const to = dateBoundary(filters.to, true)
    listDiagnosticsPage({ module: filters.module, actorId: filters.actorId, from, to, cursor: pagination.cursors[pagination.page] || '' })
      .then((result) => {
        if (!current) return
        setEntries(result.entries)
        setNextCursor(result.nextCursor)
        setError('')
      })
      .catch(() => { if (current) { setEntries([]); setNextCursor(null); setError('Die Diagnose konnte nicht geladen werden.') } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [filters, pagination, refreshKey])

  function updateFilter(name, value) {
    setLoading(true)
    setFilters((current) => ({ ...current, [name]: value }))
    setPagination({ cursors: [null], page: 0 })
  }

  function nextPage() {
    if (!nextCursor) return
    setLoading(true)
    setPagination((current) => ({ cursors: [...current.cursors.slice(0, current.page + 1), nextCursor], page: current.page + 1 }))
  }

  function previousPage() {
    setLoading(true)
    setPagination((current) => ({ ...current, page: Math.max(0, current.page - 1) }))
  }

  return <main className="admin-page diagnostics-page">
    <div className="admin-panel__heading"><div><h2>Diagnose</h2><p>Technische Fehler und fehlgeschlagene Vorgänge der Website. Keine rückwirkenden Einträge.</p></div><button type="button" className="button button--secondary" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1) }} disabled={loading}>Aktualisieren</button></div>
    <div className="diagnostics-filters">
      <label>Modul<select value={filters.module} onChange={(event) => updateFilter('module', event.target.value)}><option value="">Alle Module</option>{Object.entries(DIAGNOSTIC_MODULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Von<input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => updateFilter('from', event.target.value)} /></label>
      <label>Bis<input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => updateFilter('to', event.target.value)} /></label>
      <label>Benutzer<select value={filters.actorId} onChange={(event) => updateFilter('actorId', event.target.value)}><option value="">Alle Benutzer</option>{users.map((user) => <option key={user.id} value={user.id}>{displayUser(user)}</option>)}</select></label>
      <button type="button" className="button button--secondary" onClick={() => { setLoading(true); setFilters(initialFilters); setPagination({ cursors: [null], page: 0 }) }} disabled={!Object.values(filters).some(Boolean)}>Filter zurücksetzen</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="table-frame diagnostics-table-frame"><table className="data-table diagnostics-table"><thead><tr><th>Modul</th><th>Datum · Uhrzeit</th><th>Benutzer</th><th>Schritt</th><th>Fehler</th><th>Länder</th><th>Auftrag</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="7" className="table-state">Diagnose wird geladen …</td></tr> : entries.length ? entries.map((entry) => <tr key={entry.id}><td>{DIAGNOSTIC_MODULE_LABELS[entry.module] || entry.module}</td><td>{entry.createdAt ? dateFormatter.format(new Date(entry.createdAt)) : '—'}</td><td title={entry.actorId || undefined}>{entry.actorName || 'Unbekannt'}</td><td>{stageLabels[entry.stage] || entry.stage || '—'}</td><td className="diagnostics-table__message"><strong>{entry.code || 'Fehler'}</strong><span>{entry.message || '—'}</span></td><td>{[entry.originCountry, entry.destinationCountry].filter(Boolean).join(' → ') || '—'}</td><td>{entry.orderId || '—'}</td></tr>) : <tr><td colSpan="7" className="table-state">Für diese Filter sind keine Fehler vorhanden.</td></tr>}
    </tbody></table></div>
    <nav className="diagnostics-pagination" aria-label="Diagnoseseiten"><button type="button" className="button button--secondary" onClick={previousPage} disabled={loading || pagination.page === 0}>← Zurück</button><span>Seite {pagination.page + 1}</span><button type="button" className="button button--secondary" onClick={nextPage} disabled={loading || !nextCursor}>Weiter →</button></nav>
  </main>
}
