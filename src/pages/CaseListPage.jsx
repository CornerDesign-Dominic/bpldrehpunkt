import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Toast from '../components/ui/Toast.jsx'
import { CASE_MODULES, listCases } from '../lib/cases.js'
import { listBusinessPartners } from '../lib/businessPartners.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const date = new Intl.DateTimeFormat('de-DE')

function formatAmount(value) { return value === null || value === undefined || value === '' ? '—' : euro.format(value) }
function formatDate(value) { return value ? date.format(new Date(`${value}T00:00:00`)) : '—' }
function dueState(value) {
  if (!value) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${value}T00:00:00`)
  const diff = Math.round((due - today) / 86400000)
  return diff < 0 ? 'due-date due-date--overdue' : diff <= 7 ? 'due-date due-date--soon' : 'due-date'
}

function columnsFor(moduleKey) {
  if (moduleKey === 'legal') return [{ label: 'Aktenzeichen intern', value: (item) => item.internalReference }, { label: 'Gegenpartei', value: (item) => item.opponent }, { label: 'Geschäftspartner', value: (item, partners) => partners[item.partnerId] }, { label: 'Art', value: (item) => item.caseType }, { label: 'Status', value: (item) => <span className="case-status">{item.status}</span> }, { label: 'Streitwert', value: (item) => formatAmount(item.financial?.disputeValue) }, { label: 'Bisherige Kosten', value: (item) => formatAmount(item.financial?.totalCosts) }, { label: 'Nächste Frist', value: (item) => <span className={dueState(item.nextDueDate)}>{formatDate(item.nextDueDate)}</span> }, { label: 'Zuständiger Anwalt', value: (item) => item.lawyer }]
  if (moduleKey === 'debtCollection') return [{ label: 'Aktenzeichen', value: (item) => item.internalReference }, { label: 'Schuldner', value: (item) => item.debtor }, { label: 'DyCoS-Debitor', value: (item) => item.debtorReference }, { label: 'Hauptforderung', value: (item) => formatAmount(item.financial?.principalAmount) }, { label: 'Bisher bezahlt', value: (item) => formatAmount(item.financial?.paidAmount) }, { label: 'Restforderung', value: (item) => formatAmount(item.financial?.outstandingAmount) }, { label: 'Status', value: (item) => <span className="case-status">{item.status}</span> }, { label: 'Nächste Frist', value: (item) => <span className={dueState(item.nextDueDate)}>{formatDate(item.nextDueDate)}</span> }, { label: 'Inkassodienstleister', value: (item) => item.collectionAgency }]
  return [{ label: 'Schadennummer intern', value: (item) => item.internalReference }, { label: 'Datum', value: (item) => formatDate(item.damageDate) }, { label: 'Geschäftspartner', value: (item, partners) => partners[item.partnerId] }, { label: 'Tour / Referenz', value: (item) => item.tourReference }, { label: 'Schadensart', value: (item) => item.damageType }, { label: 'Schadenhöhe', value: (item) => formatAmount(item.financial?.claimedAmount) }, { label: 'Status', value: (item) => <span className="case-status">{item.status}</span> }, { label: 'Versicherung', value: (item) => item.insurer }, { label: 'Nächste Frist', value: (item) => <span className={dueState(item.nextDueDate)}>{formatDate(item.nextDueDate)}</span> }]
}

export default function CaseListPage({ moduleKey }) {
  const module = CASE_MODULES[moduleKey]
  const location = useLocation()
  const [cases, setCases] = useState([])
  const [partners, setPartners] = useState({})
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [toast, setToast] = useState(location.state?.toast ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listCases(moduleKey), listBusinessPartners()]).then(([items, businessPartners]) => { setCases(items); setPartners(Object.fromEntries(businessPartners.map((partner) => [partner.id, partner.companyName]))) }).catch(() => setError('Die Fallübersicht konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.')).finally(() => setLoading(false))
  }, [moduleKey])

  const visibleCases = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return cases.filter((item) => (status === 'all' || item.status === status) && (!term || [item.internalReference, item.title, item.opponent, item.debtor, item.tourReference, item.damageType, partners[item.partnerId]].some((value) => value?.toLocaleLowerCase('de-DE').includes(term))))
  }, [cases, partners, search, status])
  const columns = columnsFor(moduleKey)

  return <div className="case-list-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="list-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">Fälle suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Fälle suchen" type="search" /></label><label className="filter-field"><span className="sr-only">Status filtern</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle Status</option>{module.statuses.map((item) => <option key={item}>{item}</option>)}</select></label></div><Link className="button" to={`${module.route}/neu`}>Fall anlegen</Link></div>
    {error && <p className="form-error">{error}</p>}
    <div className="table-frame case-table-frame"><table><thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}<th>Öffnen</th></tr></thead><tbody>{loading ? <tr><td colSpan={columns.length + 1} className="table-state">Fälle werden geladen …</td></tr> : error ? <tr><td colSpan={columns.length + 1} className="table-state">Keine Fälle verfügbar.</td></tr> : visibleCases.length ? visibleCases.map((item) => <tr key={item.id}>{columns.map((column) => <td key={column.label}>{column.value(item, partners) || '—'}</td>)}<td className="table-action"><Link to={`${module.route}/${item.id}`}>Öffnen</Link></td></tr>) : <tr><td colSpan={columns.length + 1} className="table-state">Keine Fälle gefunden.</td></tr>}</tbody></table></div>
  </div>
}
