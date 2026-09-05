import { useEffect, useMemo, useState } from 'react'
import VacationCalendar from '../components/vacation/VacationCalendar.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { businessDays, formatVacationPeriod, getVacationType, todayValue } from '../lib/vacationRequests.js'
import { VACATION_MONTHS } from '../lib/vacationCalendar.js'
import { listManagedVacationData, processVacationRequest } from '../lib/vacationManagement.js'
import { getMainVacationStatus, getVacationRequestKind, getVacationRequestStatus } from '../lib/vacationStatus.js'
import '../styles/vacation.css'
import '../styles/vacationManagement.css'

const requestTypes = { request: 'Antrag', change: 'Änderung', cancellation: 'Storno' }
const statusLabels = { pending: 'Ausstehend', approved: 'Genehmigt', rejected: 'Abgelehnt', cancelled: 'Storniert', withdrawn: 'Zurückgezogen' }

function requestType(request) { const kind = getVacationRequestKind(request); return kind === 'vacation' ? 'request' : kind }
function requestStatus(request) { return requestType(request) === 'request' ? getMainVacationStatus(request) : getVacationRequestStatus(request) }
function submittedAt(request) { const date = request.submittedAt ? new Date(request.submittedAt) : null; return !date || Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date) }
function requestDays(request) { return request.days ?? businessDays(request.startDate, request.endDate) }

function RequestDetailModal({ request, actionRequest, history, onClose, onProcess }) {
  const action = actionRequest || request
  const type = requestType(action)
  const status = requestStatus(request)
  const actionStatus = requestStatus(action)
  const [managerComment, setManagerComment] = useState('')
  const requestComment = action.requestComment || action.note || 'Kein Kommentar'
  const savedManagerComment = action.managerComment || 'Kein Kommentar'
  const entries = history.filter((item) => item.vacationId === request.id).sort((left, right) => (left.createdAt?.toMillis?.() || 0) - (right.createdAt?.toMillis?.() || 0))

  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal vacation-modal--detail" role="dialog" aria-modal="true" aria-labelledby="vacation-management-detail-title"><div className="vacation-modal__heading"><div><h2 id="vacation-management-detail-title">Urlaub</h2><p>{request.employeeName} · {request.employeeDepartment || 'Keine Abteilung'}</p></div></div><dl className="vacation-detail-list"><div><dt>Mitarbeiter</dt><dd>{request.employeeName}</dd></div><div><dt>Abteilung</dt><dd>{request.employeeDepartment || 'Keine Abteilung'}</dd></div><div><dt>Hauptstatus</dt><dd><span className={`vacation-management-status vacation-management-status--${status}`}>{statusLabels[status]}</span></dd></div><div><dt>Urlaubsart</dt><dd>{getVacationType(request.vacationType).label}</dd></div><div className="vacation-detail-list__wide"><dt>Zeitraum</dt><dd>{formatVacationPeriod(request)}</dd></div><div><dt>Urlaubstage</dt><dd>{requestDays(request)}</dd></div>{actionRequest && <><div><dt>Offener Vorgang</dt><dd>{requestTypes[type]} · {statusLabels[actionStatus]}</dd></div><div className="vacation-detail-list__wide"><dt>Gewünschter Zeitraum</dt><dd>{formatVacationPeriod(action)}</dd></div></>}<div className="vacation-detail-list__wide"><dt>Kommentar des Mitarbeiters</dt><dd>{requestComment}</dd></div>{actionStatus !== 'pending' && <div className="vacation-detail-list__wide"><dt>Kommentar des Genehmigers</dt><dd>{savedManagerComment}</dd></div>}{actionStatus === 'pending' && <div className="vacation-detail-list__wide"><dt>Kommentar des Genehmigers</dt><dd><label className="form-field vacation-manager-comment"><span>Kommentar zur Entscheidung (optional)</span><textarea rows="3" value={managerComment} onChange={(event) => setManagerComment(event.target.value)} /></label></dd></div>}</dl><section className="vacation-history"><h3>Verlauf</h3>{entries.length ? entries.map((item) => <div className="vacation-history__entry" key={item.id}><strong>{item.eventType.replaceAll('_', ' ')}</strong><span>{submittedAt({ submittedAt: item.createdAt?.toDate?.()?.toISOString?.() })}</span>{item.comment && <small>{item.comment}</small>}</div>) : <p>Für diesen Urlaub liegen noch keine Verlaufsdaten vor.</p>}</section><div className="vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Abbrechen</button>{actionStatus === 'pending' && <><button className="button button--secondary" type="button" onClick={() => onProcess(action, 'rejected', managerComment)}>Ablehnen</button><button className="button" type="button" onClick={() => onProcess(action, 'approved', managerComment)}>Genehmigen</button></>}</div></section></div>
}

export default function VacationManagementPage() {
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const [requests, setRequests] = useState([])
  const [history, setHistory] = useState([])
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

  function applyData(data) { setRequests(data.requests); setHistory(data.history); setManagedEmployees(data.employees); setHolidays(data.holidays); setVacationBlocks(data.blocks) }
  async function reload() { applyData(await listManagedVacationData()) }

  useEffect(() => {
    let active = true
    listManagedVacationData().then((data) => { if (active) applyData(data) }).catch(() => { if (active) setError('Urlaubsanträge konnten nicht geladen werden.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const departments = useMemo(() => [...new Map(managedEmployees.filter((item) => item.departmentId).map((item) => [item.departmentId, item.department])).entries()].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, 'de')), [managedEmployees])
  const employees = useMemo(() => managedEmployees.filter((item) => department === 'all' || item.departmentId === department).sort((left, right) => left.name.localeCompare(right.name, 'de')), [department, managedEmployees])
  const years = useMemo(() => [...new Set([currentYear, year, ...requests.flatMap((item) => [item.startDate, item.changeRequest?.originalStartDate, item.cancellationRequest?.originalStartDate]).map((value) => Number(value?.slice(0, 4))).filter(Number.isFinite)])].sort((left, right) => right - left), [currentYear, requests, year])
  const filteredRequests = useMemo(() => requests.filter((item) => item.status !== 'superseded' && (department === 'all' || item.employeeDepartmentId === department) && (employee === 'all' || item.userId === employee)), [department, employee, requests])
  const relatedByOriginal = useMemo(() => filteredRequests.filter((item) => requestType(item) !== 'request').reduce((map, item) => { const vacationId = item.vacationId || item.originalRequestId; const related = map.get(vacationId) || []; related.push(item); map.set(vacationId, related); return map }, new Map()), [filteredRequests])
  const currentListRequests = useMemo(() => filteredRequests.filter((item) => requestType(item) === 'request').map((item) => ({ ...item, activeRequest: [...(relatedByOriginal.get(item.id) || [])].sort((left, right) => (right.submittedAt || '').localeCompare(left.submittedAt || ''))[0] || null })), [filteredRequests, relatedByOriginal])
  const visibleRequests = useMemo(() => currentListRequests.filter((item) => Number(item.startDate?.slice(0, 4)) === year).filter((item) => status === 'all' || requestStatus(item) === status).sort((left, right) => (left.activeRequest && requestStatus(left.activeRequest) === 'pending' ? 0 : 1) - (right.activeRequest && requestStatus(right.activeRequest) === 'pending' ? 0 : 1) || (right.submittedAt || '').localeCompare(left.submittedAt || '')), [currentListRequests, status, year])

  const calendarEntries = useMemo(() => [
    ...holidays.map((item) => ({ id: `holiday-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: item.label, kind: 'holiday' })),
    ...vacationBlocks.map((item) => ({ id: `block-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: item.label, kind: 'block' })),
    ...filteredRequests.filter((item) => requestType(item) === 'request' && !['cancelled', 'withdrawn', 'superseded'].includes(requestStatus(item)) && (status === 'all' || requestStatus(item) === status)).map((item) => {
      const activeRequest = [...(relatedByOriginal.get(item.id) || [])].sort((left, right) => (right.submittedAt || '').localeCompare(left.submittedAt || ''))[0]
      const pendingRequest = activeRequest && requestStatus(activeRequest) === 'pending' ? activeRequest : null
      const annotation = pendingRequest ? `${requestTypes[requestType(pendingRequest)]} angefragt` : ''
      return { id: `vacation-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: `${item.employeeName.split(' ')[0]}${annotation ? ` · ${annotation}` : ''}`, kind: requestStatus(item), modifier: pendingRequest ? `${requestType(pendingRequest)}_requested` : '', title: `${item.employeeName} · ${annotation || statusLabels[requestStatus(item)]}` }
    }),
  ], [filteredRequests, holidays, relatedByOriginal, status, vacationBlocks])

  function moveMonth(delta) { const next = new Date(year, month + delta, 1); setYear(next.getFullYear()); setMonth(next.getMonth()) }
  async function process(request, decision, managerComment) { setProcessingId(request.id); try { await processVacationRequest(request.id, decision, managerComment); await reload(); setSelectedRequest(null); const actionLabel = requestTypes[requestType(request)] || 'Antrag'; setToast(decision === 'approved' ? `${actionLabel} genehmigt.` : `${actionLabel} abgelehnt.`) } catch { setToast('Der Urlaubsantrag konnte nicht bearbeitet werden.') } finally { setProcessingId('') } }
  function requestProcess(request, decision, managerComment) { setConfirmation({ request, decision, managerComment }) }

  const confirmationType = confirmation ? requestTypes[requestType(confirmation.request)] || 'Antrag' : 'Antrag'
  return <div className="vacation-management-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<ConfirmDialog open={Boolean(confirmation)} title={confirmation ? `${confirmationType} ${confirmation.decision === 'approved' ? 'genehmigen?' : 'ablehnen?'}` : ''} message={confirmation ? `Den ${confirmationType.toLowerCase()} von ${confirmation.request.employeeName} für ${formatVacationPeriod(confirmation.request)} wirklich ${confirmation.decision === 'approved' ? 'genehmigen' : 'ablehnen'}?` : ''} confirmLabel={confirmation?.decision === 'approved' ? 'Genehmigen' : 'Ablehnen'} submittingLabel="Wird bearbeitet …" variant={confirmation?.decision === 'rejected' ? 'danger' : 'primary'} isSubmitting={Boolean(processingId)} onCancel={() => setConfirmation(null)} onConfirm={() => { const target = confirmation; setConfirmation(null); if (target) process(target.request, target.decision, target.managerComment) }} /><div className="vacation-management-heading"><h2>Urlaubsmanagement</h2></div>{error && <p className="form-error">{error}</p>}<div className="vacation-management-layout"><section className="vacation-calendar-card vacation-management-calendar"><div className="vacation-toolbar"><div className="vacation-toolbar__period"><label className="filter-field"><span className="sr-only">Monat</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{VACATION_MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label><label className="filter-field"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="vacation-nav-button" type="button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat">‹</button><button className="vacation-nav-button" type="button" onClick={() => moveMonth(1)} aria-label="Nächster Monat">›</button></div><div className="vacation-toolbar__filters"><label className="filter-field"><span className="sr-only">Abteilung</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setEmployee('all') }}><option value="all">Alle Abteilungen</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="filter-field"><span className="sr-only">Mitarbeiter</span><select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="all">Alle Mitarbeiter</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></div>{loading ? <p className="vacation-state">Kalender wird geladen …</p> : <><VacationCalendar year={year} month={month} today={todayValue()} entries={calendarEntries} /><div className="vacation-legend"><span className="vacation-legend__item vacation-legend__item--approved">Genehmigt</span><span className="vacation-legend__item vacation-legend__item--pending">Angefragt</span><span className="vacation-legend__item vacation-legend__item--change_requested">Änderung angefragt</span><span className="vacation-legend__item vacation-legend__item--cancellation_requested">Storno angefragt</span><span className="vacation-legend__item vacation-legend__item--holiday">Feiertag</span><span className="vacation-legend__item vacation-legend__item--block">Urlaubssperre</span></div></>}</section><aside className="vacation-management-list"><div className="vacation-management-list__heading"><h3>Anfragen</h3><label className="filter-field"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Alle Status</option><option value="pending">Ausstehend</option><option value="approved">Genehmigt</option><option value="rejected">Abgelehnt</option><option value="withdrawn">Zurückgezogen</option><option value="cancelled">Storniert</option></select></label></div><div className="vacation-management-request-list">{loading ? <p className="vacation-state">Anfragen werden geladen …</p> : visibleRequests.length ? visibleRequests.map((request) => <button key={request.id} type="button" className="vacation-management-request" onClick={() => setSelectedRequest(request)}><span className="vacation-management-request__top"><strong>{request.employeeName}</strong><span className={`vacation-management-status vacation-management-status--${requestStatus(request)}`}>{statusLabels[requestStatus(request)]}</span></span><span>{request.employeeDepartment || 'Keine Abteilung'} · {getVacationType(request.vacationType).label}{request.activeRequest ? ` · ${requestTypes[requestType(request.activeRequest)]} ${statusLabels[requestStatus(request.activeRequest)]}` : ''}</span><span>{formatVacationPeriod(request)}</span><small>Eingereicht {submittedAt(request)}</small></button>) : <p className="vacation-state">Keine Urlaubsanträge für diese Auswahl.</p>}</div></aside></div>{selectedRequest && <RequestDetailModal request={selectedRequest} actionRequest={requestStatus(selectedRequest.activeRequest) === 'pending' ? selectedRequest.activeRequest : null} history={history} onClose={() => setSelectedRequest(null)} onProcess={requestProcess} />}</div>
}
