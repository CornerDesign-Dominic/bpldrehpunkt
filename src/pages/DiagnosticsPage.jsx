import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { listManagedUserProfiles } from '../lib/userProfiles.js'
import { DIAGNOSTIC_MODULE_LABELS, listDiagnosticsPage } from '../lib/diagnostics.js'
import '../styles/admin.css'

const dateFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const initialFilters = { module: '', actorId: '', from: '', to: '' }
const stageLabels = {
  preparation: 'Vorbereitung', configuration: 'Konfiguration', geocoding_origin: 'Geocoding Start',
  geocoding_destination: 'Geocoding Ziel', routing: 'Routing', load: 'Laden', send: 'Versand',
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
    <div className="admin-panel__heading"><div><h2><StaticText source={"Diagnose"} /></h2><p><StaticText source={"Technische Fehler und fehlgeschlagene Vorgänge der Website. Keine rückwirkenden Einträge."} /></p></div><button type="button" className="button button--secondary" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1) }} disabled={loading}><StaticText source={"Aktualisieren"} /></button></div>
    <div className="diagnostics-filters">
      <label><StaticText source={"Modul"} /><select value={filters.module} onChange={(event) => updateFilter('module', event.target.value)}><option value=""><StaticText source={"Alle Module"} /></option>{Object.entries(DIAGNOSTIC_MODULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><StaticText source={"Von"} /><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => updateFilter('from', event.target.value)} /></label>
      <label><StaticText source={"Bis"} /><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => updateFilter('to', event.target.value)} /></label>
      <label><StaticText source={"Benutzer"} /><select value={filters.actorId} onChange={(event) => updateFilter('actorId', event.target.value)}><option value=""><StaticText source={"Alle Benutzer"} /></option>{users.map((user) => <option key={user.id} value={user.id}>{displayUser(user)}</option>)}</select></label>
      <button type="button" className="button button--secondary" onClick={() => { setLoading(true); setFilters(initialFilters); setPagination({ cursors: [null], page: 0 }) }} disabled={!Object.values(filters).some(Boolean)}><StaticText source={"Filter zurücksetzen"} /></button>
    </div>
    {error && <p className="form-error" role="alert">{<StaticText source={error} />}</p>}
    <div className="table-frame diagnostics-table-frame"><table className="data-table diagnostics-table"><thead><tr><th><StaticText source={"Modul"} /></th><th><StaticText source={"Datum · Uhrzeit"} /></th><th><StaticText source={"Benutzer"} /></th><th><StaticText source={"Schritt"} /></th><th><StaticText source={"Fehler"} /></th><th><StaticText source={"Länder"} /></th><th><StaticText source={"Auftrag"} /></th></tr></thead><tbody>
      {loading ? <tr><td colSpan="7" className="table-state"><StaticText source={"Diagnose wird geladen …"} /></td></tr> : entries.length ? entries.map((entry) => <tr key={entry.id}><td>{DIAGNOSTIC_MODULE_LABELS[entry.module] || entry.module}</td><td>{entry.createdAt ? dateFormatter.format(new Date(entry.createdAt)) : '—'}</td><td title={entry.actorId || undefined}>{entry.actorName || 'Unbekannt'}</td><td>{stageLabels[entry.stage] || entry.stage || '—'}</td><td className="diagnostics-table__message"><strong>{entry.code || <StaticText source={"Fehler"} />}</strong><span>{entry.message || '—'}</span></td><td>{[entry.originCountry, entry.destinationCountry].filter(Boolean).join(' → ') || '—'}</td><td>{entry.orderId || '—'}</td></tr>) : <tr><td colSpan="7" className="table-state"><StaticText source={"Für diese Filter sind keine Fehler vorhanden."} /></td></tr>}
    </tbody></table></div>
    <TranslatedProps sources={{"aria-label":"Diagnoseseiten"}}><nav className="diagnostics-pagination" aria-label="Diagnoseseiten"><button type="button" className="button button--secondary" onClick={previousPage} disabled={loading || pagination.page === 0}><StaticText source={"← Zurück"} /></button><span><StaticText source={"Seite"} /> {pagination.page + 1}</span><button type="button" className="button button--secondary" onClick={nextPage} disabled={loading || !nextCursor}><StaticText source={"Weiter →"} /></button></nav></TranslatedProps>
  </main>
}
