import { useEffect, useMemo, useState } from 'react'
import Toast from '../components/ui/Toast.jsx'
import { formatVacationPeriod } from '../lib/vacationRequests.js'
import { listManagedVacationRequests, processVacationRequest } from '../lib/vacationManagement.js'
import '../styles/vacationManagement.css'

const requestTypes = { request: 'Antrag', change: 'Änderung', cancellation: 'Storno' }
const statusLabels = { pending: 'Ausstehend', approved: 'Genehmigt', rejected: 'Abgelehnt' }

function requestStatus(request) {
  return ['pending', 'change_requested', 'cancellation_requested'].includes(request.status) ? 'pending' : request.status
}

function submittedAt(request) {
  if (!request.submittedAt) return '—'
  const date = new Date(request.submittedAt)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE').format(date)
}

export default function VacationManagementPage() {
  const currentYear = new Date().getFullYear()
  const [requests, setRequests] = useState([])
  const [year, setYear] = useState(currentYear)
  const [status, setStatus] = useState('all')
  const [department, setDepartment] = useState('all')
  const [employee, setEmployee] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processingId, setProcessingId] = useState('')
  const [toast, setToast] = useState('')

  async function reload() {
    setRequests(await listManagedVacationRequests())
  }

  useEffect(() => {
    let active = true
    listManagedVacationRequests()
      .then((items) => { if (active) setRequests(items) })
      .catch(() => { if (active) setError('Urlaubsanträge konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const departments = useMemo(() => [...new Set(requests.map((item) => item.employeeDepartment).filter((item) => item && item !== '—'))].sort((left, right) => left.localeCompare(right, 'de')), [requests])
  const employees = useMemo(() => [...new Set(requests.filter((item) => department === 'all' || item.employeeDepartment === department).map((item) => item.employeeName).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de')), [department, requests])
  const years = useMemo(() => [...new Set([currentYear, ...requests.map((item) => Number(item.startDate?.slice(0, 4))).filter(Number.isFinite)])].sort((left, right) => right - left), [currentYear, requests])
  const visibleRequests = useMemo(() => requests
    .filter((item) => Number(item.startDate?.slice(0, 4)) === year)
    .filter((item) => status === 'all' || requestStatus(item) === status)
    .filter((item) => department === 'all' || item.employeeDepartment === department)
    .filter((item) => employee === 'all' || item.employeeName === employee)
    .sort((left, right) => (requestStatus(left) === 'pending' ? 0 : 1) - (requestStatus(right) === 'pending' ? 0 : 1) || (right.submittedAt || '').localeCompare(left.submittedAt || '')), [department, employee, requests, status, year])

  async function process(request, decision) {
    const action = decision === 'approved' ? 'genehmigen' : 'ablehnen'
    if (!window.confirm(`Diesen Urlaubsantrag wirklich ${action}?`)) return
    setProcessingId(request.id)
    try {
      await processVacationRequest(request.id, decision)
      await reload()
      setToast(decision === 'approved' ? 'Urlaubsantrag genehmigt.' : 'Urlaubsantrag abgelehnt.')
    } catch {
      setToast('Der Urlaubsantrag konnte nicht bearbeitet werden.')
    } finally {
      setProcessingId('')
    }
  }

  return <div className="vacation-management-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<div className="vacation-management-toolbar"><div className="vacation-management-filters"><label className="filter-field"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-field"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle Status</option><option value="pending">Ausstehend</option><option value="approved">Genehmigt</option><option value="rejected">Abgelehnt</option></select></label><label className="filter-field"><span className="sr-only">Abteilung</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setEmployee('all') }}><option value="all">Alle Abteilungen</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-field"><span className="sr-only">Mitarbeiter</span><select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="all">Alle Mitarbeiter</option>{employees.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div></div>{error && <p className="form-error">{error}</p>}<div className="table-frame vacation-management-table"><table><thead><tr><th>Mitarbeiter</th><th>Abteilung</th><th>Zeitraum</th><th>Urlaubstage</th><th>Typ</th><th>Status</th><th>Eingereicht am</th><th>Aktionen</th></tr></thead><tbody>{loading ? <tr><td colSpan="8" className="table-state">Urlaubsanträge werden geladen …</td></tr> : visibleRequests.length ? visibleRequests.map((request) => { const normalizedStatus = requestStatus(request); const pending = normalizedStatus === 'pending'; return <tr key={request.id}><td><strong>{request.employeeName}</strong></td><td>{request.employeeDepartment}</td><td>{formatVacationPeriod(request)}</td><td>{request.days ?? '—'}</td><td>{requestTypes[request.requestType] || 'Antrag'}</td><td><span className={`vacation-management-status vacation-management-status--${normalizedStatus}`}>{statusLabels[normalizedStatus] || 'Ausstehend'}</span></td><td>{submittedAt(request)}</td><td className="vacation-management-actions">{pending ? <><button type="button" onClick={() => process(request, 'approved')} disabled={processingId === request.id}>{processingId === request.id ? 'Wird bearbeitet …' : 'Genehmigen'}</button><button className="vacation-management-actions__reject" type="button" onClick={() => process(request, 'rejected')} disabled={processingId === request.id}>Ablehnen</button></> : '—'}</td></tr> }) : <tr><td colSpan="8" className="table-state">Keine Urlaubsanträge für diese Auswahl.</td></tr>}</tbody></table></div></div>
}
