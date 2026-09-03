import { useEffect, useMemo, useState } from 'react'
import VacationCalendar from '../components/vacation/VacationCalendar.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { businessDays, formatVacationPeriod, getVacationType, todayValue } from '../lib/vacationRequests.js'
import { VACATION_MONTHS } from '../lib/vacationCalendar.js'
import { listManagedVacationData, processVacationRequest } from '../lib/vacationManagement.js'
import '../styles/vacation.css'
import '../styles/vacationManagement.css'

const requestTypes = { request: 'Antrag', change: 'Änderung', cancellation: 'Storno' }
const statusLabels = { pending: 'Ausstehend', approved: 'Genehmigt', rejected: 'Abgelehnt' }

function requestStatus(request) { return ['pending', 'change_requested', 'cancellation_requested'].includes(request.status) ? 'pending' : request.status }
function requestType(request) { return request.requestType || (request.requestKind === 'cancellation' || request.cancellationRequest ? 'cancellation' : request.originalRequestId ? 'change' : 'request') }
function submittedAt(request) { const date = request.submittedAt ? new Date(request.submittedAt) : null; return !date || Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE').format(date) }
function requestDays(request) { return request.days ?? businessDays(request.startDate, request.endDate) }
function originalPeriod(request, originalRequest) { const details = request.changeRequest || request.cancellationRequest || {}; return { startDate: details.originalStartDate || originalRequest?.startDate || request.startDate, endDate: details.originalEndDate || originalRequest?.endDate || request.endDate } }

function RequestDetailModal({ request, originalRequest, onClose, onProcess }) {
  const type = requestType(request)
  const status = requestStatus(request)
  const original = originalPeriod(request, originalRequest)
  const actionLabel = type === 'change' ? 'Änderung' : type === 'cancellation' ? 'Storno' : 'Antrag'
  const [managerComment, setManagerComment] = useState('')
  const requestComment = request.requestComment || request.note || 'Kein Kommentar'
  const savedManagerComment = request.managerComment || 'Kein Kommentar'

  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal vacation-modal--detail" role="dialog" aria-modal="true" aria-labelledby="vacation-management-detail-title"><div className="vacation-modal__heading"><div><h2 id="vacation-management-detail-title">{actionLabel}</h2><p>{request.employeeName} · {request.employeeDepartment || 'Keine Abteilung'}</p></div></div><dl className="vacation-detail-list"><div><dt>Mitarbeiter</dt><dd>{request.employeeName}</dd></div><div><dt>Abteilung</dt><dd>{request.employeeDepartment || 'Keine Abteilung'}</dd></div><div><dt>Antragstyp</dt><dd>{requestTypes[type]}</dd></div><div><dt>Urlaubsart</dt><dd>{getVacationType(request.vacationType).label}</dd></div><div><dt>Status</dt><dd><span className={`vacation-management-status vacation-management-status--${status}`}>{statusLabels[status]}</span></dd></div><div><dt>Eingereicht am</dt><dd>{submittedAt(request)}</dd></div><div><dt>Urlaubstage</dt><dd>{requestDays(request)}</dd></div>{type === 'request' && <div className="vacation-detail-list__wide"><dt>Beantragter Zeitraum</dt><dd>{formatVacationPeriod(request)}</dd></div>}{type === 'change' && <><div className="vacation-detail-list__wide"><dt>Bisheriger Zeitraum</dt><dd>{formatVacationPeriod(original)}</dd></div><div className="vacation-detail-list__wide"><dt>Neuer gewünschter Zeitraum</dt><dd>{formatVacationPeriod(request)}</dd></div></>}{type === 'cancellation' && <div className="vacation-detail-list__wide"><dt>Zu stornierender Zeitraum</dt><dd>{formatVacationPeriod(original)}</dd></div>}<div className="vacation-detail-list__wide"><dt>Kommentar des Mitarbeiters</dt><dd>{requestComment}</dd></div>{status !== 'pending' && <div className="vacation-detail-list__wide"><dt>Kommentar des Genehmigers</dt><dd>{savedManagerComment}</dd></div>}{status === 'pending' && <div className="vacation-detail-list__wide"><dt>Kommentar des Genehmigers</dt><dd><label className="form-field vacation-manager-comment"><span>Kommentar zur Entscheidung (optional)</span><textarea rows="3" value={managerComment} onChange={(event) => setManagerComment(event.target.value)} /></label></dd></div>}</dl><div className="vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Abbrechen</button>{status === 'pending' && <><button className="button button--secondary" type="button" onClick={() => onProcess(request, 'rejected', managerComment)}>Ablehnen</button><button className="button" type="button" onClick={() => onProcess(request, 'approved', managerComment)}>Genehmigen</button></>}</div></section></div>
}

export default function VacationManagementPage() {
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const [requests, setRequests] = useState([])
  const [managedEmployees, setManagedEmployees] = useState([])
  const [holidays, setHolidays] = useState([])
  const [vacationBlocks, setVacationBlocks] = useState([])
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentDate.getMonth())
  const [status, setStatus] = useState('all')
  const [department, setDepartment] = useState('all')
  const [employee, setEmployee] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processingId, setProcessingId] = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [toast, setToast] = useState('')

  function applyData(data) { setRequests(data.requests); setManagedEmployees(data.employees); setHolidays(data.holidays); setVacationBlocks(data.blocks) }
  async function reload() { applyData(await listManagedVacationData()) }

  useEffect(() => {
    let active = true
    listManagedVacationData().then((data) => { if (active) applyData(data) }).catch(() => { if (active) setError('Urlaubsanträge konnten nicht geladen werden.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const departments = useMemo(() => [...new Map(managedEmployees.filter((item) => item.departmentId).map((item) => [item.departmentId, item.department])).entries()].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'de')), [managedEmployees])
  const employees = useMemo(() => managedEmployees.filter((item) => department === 'all' || item.departmentId === department).sort((left, right) => left.name.localeCompare(right.name, 'de')), [department, managedEmployees])
  const years = useMemo(() => [...new Set([currentYear, year, ...requests.flatMap((item) => [item.startDate, item.changeRequest?.originalStartDate, item.cancellationRequest?.originalStartDate]).map((value) => Number(value?.slice(0, 4))).filter(Number.isFinite)])].sort((left, right) => right - left), [currentYear, requests, year])
  const filteredRequests = useMemo(() => requests.filter((item) => (department === 'all' || item.employeeDepartmentId === department) && (employee === 'all' || item.userId === employee)), [department, employee, requests])
  const visibleRequests = useMemo(() => filteredRequests.filter((item) => Number(item.startDate?.slice(0, 4)) === year).filter((item) => status === 'all' || requestStatus(item) === status).sort((left, right) => (requestStatus(left) === 'pending' ? 0 : 1) - (requestStatus(right) === 'pending' ? 0 : 1) || (right.submittedAt || '').localeCompare(left.submittedAt || '')), [filteredRequests, status, year])
  const requestsById = useMemo(() => new Map(filteredRequests.map((item) => [item.id, item])), [filteredRequests])
  const relatedByOriginal = useMemo(() => filteredRequests.filter((item) => item.originalRequestId).reduce((map, item) => { const related = map.get(item.originalRequestId) || []; related.push(item); map.set(item.originalRequestId, related); return map }, new Map()), [filteredRequests])

  const calendarEntries = useMemo(() => {
    const baseRequests = filteredRequests.filter((item) => !item.originalRequestId && requestStatus(item) !== 'rejected')
    const changeRequests = filteredRequests.filter((item) => requestType(item) === 'change' && ['pending', 'approved'].includes(requestStatus(item)))
    return [
      ...holidays.map((item) => ({ id: `holiday-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: item.label, kind: 'holiday' })),
      ...vacationBlocks.map((item) => ({ id: `block-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: item.label, kind: 'block' })),
      ...baseRequests.map((item) => {
        const related = relatedByOriginal.get(item.id) || []
        const pendingChange = related.find((relatedRequest) => requestType(relatedRequest) === 'change' && requestStatus(relatedRequest) === 'pending')
        const pendingCancellation = related.find((relatedRequest) => requestType(relatedRequest) === 'cancellation' && requestStatus(relatedRequest) === 'pending')
        const approvedCancellation = related.find((relatedRequest) => requestType(relatedRequest) === 'cancellation' && requestStatus(relatedRequest) === 'approved')
        const annotation = pendingCancellation ? 'Storno angefragt' : pendingChange ? 'Änderung angefragt' : approvedCancellation ? 'Storno genehmigt' : ''
        return { id: `base-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: `${item.employeeName.split(' ')[0]}${annotation ? ` · ${annotation}` : ''}`, kind: requestStatus(item), modifier: pendingCancellation ? 'cancellation_requested' : pendingChange ? 'change_requested' : '', title: `${item.employeeName} · ${annotation || statusLabels[requestStatus(item)]}` }
      }),
      ...changeRequests.map((item) => ({ id: `change-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: `${item.employeeName.split(' ')[0]} · Änderung`, kind: requestStatus(item), modifier: requestStatus(item) === 'pending' ? 'change_requested' : '', title: `${item.employeeName} · ${requestStatus(item) === 'approved' ? 'Änderung genehmigt' : 'Änderung angefragt'}` })),
    ]
  }, [filteredRequests, holidays, relatedByOriginal, vacationBlocks])

  function moveMonth(delta) { const next = new Date(year, month + delta, 1); setYear(next.getFullYear()); setMonth(next.getMonth()) }
  async function process(request, decision, managerComment) { setProcessingId(request.id); try { await processVacationRequest(request.id, decision, managerComment); await reload(); setSelectedRequest(null); const actionLabel = requestTypes[requestType(request)] || 'Antrag'; setToast(decision === 'approved' ? `${actionLabel} genehmigt.` : `${actionLabel} abgelehnt.`) } catch { setToast('Der Urlaubsantrag konnte nicht bearbeitet werden.') } finally { setProcessingId('') } }
  function requestProcess(request, decision, managerComment) { setConfirmation({ request, decision, managerComment }) }

  const selectedOriginal = selectedRequest?.originalRequestId ? requestsById.get(selectedRequest.originalRequestId) : null
  const confirmationType = confirmation ? requestTypes[requestType(confirmation.request)] || 'Antrag' : 'Antrag'
  return <div className="vacation-management-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<ConfirmDialog open={Boolean(confirmation)} title={confirmation ? `${confirmationType} ${confirmation.decision === 'approved' ? 'genehmigen?' : 'ablehnen?'}` : ''} message={confirmation ? `Den ${confirmationType.toLowerCase()} von ${confirmation.request.employeeName} für ${formatVacationPeriod(confirmation.request)} wirklich ${confirmation.decision === 'approved' ? 'genehmigen' : 'ablehnen'}?` : ''} confirmLabel={confirmation?.decision === 'approved' ? 'Genehmigen' : 'Ablehnen'} submittingLabel="Wird bearbeitet …" variant={confirmation?.decision === 'rejected' ? 'danger' : 'primary'} isSubmitting={Boolean(processingId)} onCancel={() => setConfirmation(null)} onConfirm={() => { const target = confirmation; setConfirmation(null); if (target) process(target.request, target.decision, target.managerComment) }} /><div className="vacation-management-heading"><h2>Urlaubsmanagement</h2></div>{error && <p className="form-error">{error}</p>}<div className="vacation-management-layout"><section className="vacation-calendar-card vacation-management-calendar"><div className="vacation-toolbar"><div className="vacation-toolbar__period"><label className="filter-field"><span className="sr-only">Monat</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{VACATION_MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label><label className="filter-field"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="vacation-nav-button" type="button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat">‹</button><button className="vacation-nav-button" type="button" onClick={() => moveMonth(1)} aria-label="Nächster Monat">›</button></div><div className="vacation-toolbar__filters"><label className="filter-field"><span className="sr-only">Abteilung</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setEmployee('all') }}><option value="all">Alle Abteilungen</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="filter-field"><span className="sr-only">Mitarbeiter</span><select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="all">Alle Mitarbeiter</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></div>{loading ? <p className="vacation-state">Kalender wird geladen …</p> : <><VacationCalendar year={year} month={month} today={todayValue()} entries={calendarEntries} /><div className="vacation-legend"><span className="vacation-legend__item vacation-legend__item--approved">Genehmigt</span><span className="vacation-legend__item vacation-legend__item--pending">Angefragt</span><span className="vacation-legend__item vacation-legend__item--change_requested">Änderung angefragt</span><span className="vacation-legend__item vacation-legend__item--cancellation_requested">Storno angefragt</span><span className="vacation-legend__item vacation-legend__item--holiday">Feiertag</span><span className="vacation-legend__item vacation-legend__item--block">Urlaubssperre</span></div></>}</section><aside className="vacation-management-list"><div className="vacation-management-list__heading"><h3>Anfragen</h3><label className="filter-field"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle Status</option><option value="pending">Ausstehend</option><option value="approved">Genehmigt</option><option value="rejected">Abgelehnt</option></select></label></div><div className="vacation-management-request-list">{loading ? <p className="vacation-state">Anfragen werden geladen …</p> : visibleRequests.length ? visibleRequests.map((request) => <button key={request.id} type="button" className="vacation-management-request" onClick={() => setSelectedRequest(request)}><span className="vacation-management-request__top"><strong>{request.employeeName}</strong><span className={`vacation-management-status vacation-management-status--${requestStatus(request)}`}>{statusLabels[requestStatus(request)]}</span></span><span>{request.employeeDepartment || 'Keine Abteilung'} · {requestTypes[requestType(request)]} · {getVacationType(request.vacationType).label}</span><span>{formatVacationPeriod(request)}</span><small>Eingereicht {submittedAt(request)}</small></button>) : <p className="vacation-state">Keine Urlaubsanträge für diese Auswahl.</p>}</div></aside></div>{selectedRequest && <RequestDetailModal request={selectedRequest} originalRequest={selectedOriginal} onClose={() => setSelectedRequest(null)} onProcess={requestProcess} />}</div>
}
