import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPersonnelEmployees } from '../lib/personnel.js'
import '../styles/personnel.css'

function displayName(employee) {
  return [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || '—'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE').format(date)
}

export default function PersonnelPage() {
  const [employees, setEmployees] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    listPersonnelEmployees()
      .then((items) => { if (current) setEmployees(items) })
      .catch(() => { if (current) setError('Mitarbeiter konnten nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return employees
      .filter((employee) => !term || [displayName(employee), employee.personnelNumber, employee.department, employee.jobTitle].some((value) => value?.toLocaleLowerCase('de-DE').includes(term)))
      .sort((left, right) => displayName(left).localeCompare(displayName(right), 'de'))
  }, [employees, search])

  return <div className="personnel-page">
    <nav className="personnel-subnav" aria-label="Personalverwaltung"><Link to="/personal" className="personnel-subnav__active">Mitarbeiter</Link><Link to="/personal/urlaub">Urlaub</Link></nav>
    <div className="personnel-toolbar"><label className="search-field"><span className="sr-only">Mitarbeiter suchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, Personalnummer, Abteilung oder Funktion suchen" /></label></div>
    {error && <p className="form-error">{error}</p>}
    <div className="personnel-table table-frame"><table><thead><tr><th>Name</th><th>Personalnummer</th><th>Abteilung</th><th>Funktion</th><th>Eintrittsdatum</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="5" className="table-state">Mitarbeiter werden geladen …</td></tr> : error ? <tr><td colSpan="5" className="table-state">Mitarbeiter können derzeit nicht angezeigt werden.</td></tr> : visibleEmployees.length ? visibleEmployees.map((employee) => <tr key={employee.id}><td><Link className="personnel-table__employee" to={`/personal/${employee.id}`}>{displayName(employee)}</Link></td><td>{employee.personnelNumber || '—'}</td><td>{employee.department || '—'}</td><td>{employee.jobTitle || '—'}</td><td>{formatDate(employee.employmentStart)}</td></tr>) : <tr><td colSpan="5" className="table-state">Keine Mitarbeiter gefunden.</td></tr>}
    </tbody></table></div>
  </div>
}
