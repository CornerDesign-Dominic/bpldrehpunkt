import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { PersonnelVacationMetaModal, PersonnelVacationTable } from '../components/personnel/PersonnelVacationTable.jsx'
import Toast from '../components/ui/Toast.jsx'
import { listPersonnelVacations, updatePersonnelVacationMeta } from '../lib/personnel.js'
import '../styles/personnel.css'

function overlapsYear(vacation, year) {
  return vacation.startDate <= `${year}-12-31` && vacation.endDate >= `${year}-01-01`
}

export default function PersonnelVacationPage() {
  const { canEdit } = usePermissions()
  const currentYear = new Date().getFullYear()
  const [vacations, setVacations] = useState([])
  const [year, setYear] = useState(currentYear)
  const [employee, setEmployee] = useState('all')
  const [department, setDepartment] = useState('all')
  const [status, setStatus] = useState('all')
  const [payroll, setPayroll] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedVacation, setSelectedVacation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function reload() {
    const items = await listPersonnelVacations()
    setVacations(items)
  }

  useEffect(() => {
    let current = true
    listPersonnelVacations()
      .then((items) => { if (current) setVacations(items) })
      .catch(() => { if (current) setError('Urlaubsübersicht konnte nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const years = useMemo(() => [...new Set([currentYear, year, ...vacations.flatMap((vacation) => [Number(vacation.startDate?.slice(0, 4)), Number(vacation.endDate?.slice(0, 4))]).filter(Number.isFinite)])].sort((left, right) => right - left), [currentYear, vacations, year])
  const departments = useMemo(() => [...new Map(vacations.filter((vacation) => vacation.departmentId).map((vacation) => [vacation.departmentId, vacation.department])).entries()].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'de')), [vacations])
  const employees = useMemo(() => [...new Map(vacations.filter((vacation) => department === 'all' || vacation.departmentId === department).map((vacation) => [vacation.userId, vacation.employeeName])).entries()].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'de')), [department, vacations])
  const visibleVacations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return vacations.filter((vacation) => overlapsYear(vacation, year))
      .filter((vacation) => department === 'all' || vacation.departmentId === department)
      .filter((vacation) => employee === 'all' || vacation.userId === employee)
      .filter((vacation) => status === 'all' || vacation.status === status)
      .filter((vacation) => payroll === 'all' || (payroll === 'done' ? vacation.payrollProcessed : !vacation.payrollProcessed))
      .filter((vacation) => !term || vacation.employeeName.toLocaleLowerCase('de-DE').includes(term))
      .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.employeeName.localeCompare(right.employeeName, 'de'))
  }, [department, employee, payroll, search, status, vacations, year])

  async function saveMeta(values) {
    if (!selectedVacation) return
    setSaving(true)
    setError('')
    try {
      await updatePersonnelVacationMeta(selectedVacation.vacationId, values)
      await reload()
      setSelectedVacation(null)
      setToast('HR-Informationen wurden aktualisiert.')
    } catch (saveError) {
      setError(saveError?.message?.replace(/^.*?:\s*/, '') || 'HR-Informationen konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="personnel-page"><nav className="personnel-subnav" aria-label="Personalverwaltung"><Link to="/personal">Mitarbeiter</Link><Link to="/personal/urlaub" className="personnel-subnav__active">Urlaub</Link></nav>{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<div className="personnel-vacation-filters"><label className="filter-field"><span>Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-field"><span>Mitarbeiter</span><select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="all">Alle Mitarbeiter</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="filter-field"><span>Abteilung</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setEmployee('all') }}><option value="all">Alle Abteilungen</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="filter-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle Status</option><option value="pending">Ausstehend</option><option value="approved">Genehmigt</option><option value="rejected">Abgelehnt</option><option value="cancelled">Storniert</option><option value="withdrawn">Zurückgezogen</option></select></label><label className="filter-field"><span>Lohnbuchhaltung</span><select value={payroll} onChange={(event) => setPayroll(event.target.value)}><option value="all">Alle</option><option value="open">Offen</option><option value="done">Erledigt</option></select></label><label className="search-field"><span className="sr-only">Mitarbeiter suchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mitarbeiter suchen" /></label></div>{error && <p className="form-error">{error}</p>}{loading ? <p className="personnel-state">Urlaubsübersicht wird geladen …</p> : <PersonnelVacationTable vacations={visibleVacations} editable={canEdit('personnel')} onEdit={setSelectedVacation} />}{selectedVacation && <PersonnelVacationMetaModal key={selectedVacation.vacationId} vacation={selectedVacation} saving={saving} onClose={() => setSelectedVacation(null)} onSave={saveMeta} />}</div>
}
