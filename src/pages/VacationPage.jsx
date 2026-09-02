import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import Toast from '../components/ui/Toast.jsx'
import { getUserDisplayName, listUserProfiles } from '../lib/userProfiles.js'
import {
  VACATION_STATUSES,
  businessDays,
  createVacationChangeRequest,
  createVacationRequest,
  dateValue,
  formatVacationPeriod,
  getVacationStatus,
  listVacationRequests,
  requestOverlaps,
  todayValue,
} from '../lib/vacationRequests.js'
import '../styles/vacation.css'

const MONTHS = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date(2024, month, 1)))
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function displayName(profile) {
  return getUserDisplayName(profile, profile)
}

function monthDays(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startOffset = (first.getDay() + 6) % 7
  const result = Array.from({ length: startOffset }, () => null)
  for (let day = 1; day <= last.getDate(); day += 1) result.push(new Date(year, month, day))
  while (result.length % 7) result.push(null)
  return result
}

function vacationAllowance(profile) {
  return Number(profile?.vacationAllowance ?? profile?.vacationEntitlement ?? profile?.annualVacationEntitlement ?? 0) || 0
}

function previousYearCarryover(profile) {
  return Number(profile?.vacationCarryover ?? profile?.previousYearVacationCarryover ?? 0) || 0
}

async function loadVacationData(currentUser, currentProfile) {
  const [profiles, requests] = await Promise.all([listUserProfiles(), listVacationRequests(currentUser.uid)])
  const ownProfile = { id: currentUser.uid, ...currentProfile, email: currentUser.email || currentProfile?.email }
  return { users: profiles.some((item) => item.id === currentUser.uid) ? profiles : [...profiles, ownProfile], requests }
}

function requestDaysInYear(request, year) {
  const start = request.startDate < `${year}-01-01` ? `${year}-01-01` : request.startDate
  const end = request.endDate > `${year}-12-31` ? `${year}-12-31` : request.endDate
  return businessDays(start, end)
}

function StatusBadge({ status }) {
  const item = getVacationStatus(status)
  return <span className={`vacation-status vacation-status--${item.value}`}>{item.label}</span>
}

function RequestModal({ request, onClose, onSubmit }) {
  const isChange = Boolean(request)
  const [form, setForm] = useState({ startDate: request?.startDate || todayValue(), endDate: request?.endDate || todayValue(), note: request?.note || '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const days = businessDays(form.startDate, form.endDate)

  async function submit(event) {
    event.preventDefault()
    if (!form.startDate || !form.endDate || form.endDate < form.startDate || !days) {
      setError('Bitte einen gültigen Zeitraum mit mindestens einem Arbeitstag wählen.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(form)
    } catch {
      setError('Der Antrag konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal" role="dialog" aria-modal="true" aria-labelledby="vacation-modal-title"><div className="vacation-modal__heading"><div><h2 id="vacation-modal-title">{isChange ? 'Änderung beantragen' : 'Urlaub beantragen'}</h2>{isChange && <p>Der ursprüngliche Antrag bleibt unverändert erhalten.</p>}</div><button className="vacation-modal__close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button></div><form onSubmit={submit} noValidate><div className="vacation-modal__fields"><label className="form-field"><span>Von</span><input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label className="form-field"><span>Bis</span><input type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></label><div className="vacation-form-days"><span>Urlaubstage</span><strong>{days}</strong></div><label className="form-field vacation-modal__note"><span>Notiz (optional)</span><textarea rows="3" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label></div>{error && <p className="form-error">{error}</p>}<div className="vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gesendet …' : isChange ? 'Änderungsantrag senden' : 'Antrag senden'}</button></div></form></section></div>
}

function RequestDetail({ request, onClose, onChange }) {
  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal vacation-modal--detail" role="dialog" aria-modal="true" aria-labelledby="vacation-detail-title"><div className="vacation-modal__heading"><div><h2 id="vacation-detail-title">Urlaubsantrag</h2><p>{formatVacationPeriod(request)}</p></div><button className="vacation-modal__close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button></div><dl className="vacation-detail-list"><div><dt>Urlaubstage</dt><dd>{request.days ?? businessDays(request.startDate, request.endDate)}</dd></div><div><dt>Status</dt><dd><StatusBadge status={request.status} /></dd></div>{request.note && <div className="vacation-detail-list__wide"><dt>Notiz</dt><dd>{request.note}</dd></div>}{request.originalRequestId && <div className="vacation-detail-list__wide"><dt>Bezug</dt><dd>Änderungsantrag zu einem bestehenden Urlaub.</dd></div>}</dl><div className="vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Schließen</button><button className="button" type="button" onClick={onChange}>Änderung beantragen</button></div></section></div>
}

export default function VacationPage() {
  const { user, profile } = useAuth()
  const today = todayValue()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [department, setDepartment] = useState('all')
  const [employee, setEmployee] = useState('all')
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [listYear, setListYear] = useState(currentYear)
  const [toast, setToast] = useState('')

  async function reload() {
    const result = await loadVacationData(user, profile)
    setUsers(result.users)
    setRequests(result.requests)
  }

  useEffect(() => {
    let active = true
    loadVacationData(user, profile)
      .then((result) => {
        if (!active) return
        setUsers(result.users)
        setRequests(result.requests)
      })
      .catch(() => { if (active) setError('Urlaubsdaten konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [profile, user])

  const departments = useMemo(() => [...new Set(users.map((item) => item.department?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de')), [users])
  const selectableUsers = useMemo(() => users.filter((item) => department === 'all' || item.department?.trim() === department).sort((left, right) => displayName(left).localeCompare(displayName(right), 'de')), [department, users])
  const usersById = useMemo(() => new Map(users.map((item) => [item.id, item])), [users])
  const visibleRequests = useMemo(() => requests.filter((request) => {
    const isOwn = request.userId === user.uid
    const owner = usersById.get(request.userId)
    return requestOverlaps(request, `${year}-${String(month + 1).padStart(2, '0')}-01`, `${year}-${String(month + 1).padStart(2, '0')}-31`)
      && (isOwn || request.status === 'approved')
      && (department === 'all' || owner?.department?.trim() === department)
      && (employee === 'all' || request.userId === employee)
  }), [department, employee, month, requests, user.uid, usersById, year])
  const ownRequests = useMemo(() => requests.filter((request) => request.userId === user.uid), [requests, user.uid])
  const ownList = useMemo(() => ownRequests.filter((request) => requestOverlaps(request, `${listYear}-01-01`, `${listYear}-12-31`)).sort((left, right) => right.startDate.localeCompare(left.startDate)), [listYear, ownRequests])
  const summary = useMemo(() => {
    const relevant = ownRequests.filter((request) => request.status === 'approved' && requestOverlaps(request, `${year}-01-01`, `${year}-12-31`))
    const taken = relevant.filter((request) => request.endDate < today).reduce((sum, request) => sum + requestDaysInYear(request, year), 0)
    const planned = relevant.filter((request) => request.endDate >= today).reduce((sum, request) => sum + requestDaysInYear(request, year), 0)
    const pending = ownRequests.filter((request) => request.status === 'pending' && requestOverlaps(request, `${year}-01-01`, `${year}-12-31`)).reduce((sum, request) => sum + requestDaysInYear(request, year), 0)
    const allowance = vacationAllowance(profile)
    const carryover = previousYearCarryover(profile)
    return { allowance, carryover, taken, planned, pending, remaining: allowance + carryover - taken - planned }
  }, [ownRequests, profile, today, year])
  const calendarDays = useMemo(() => monthDays(year, month), [month, year])
  const years = Array.from({ length: 7 }, (_, index) => currentYear - 2 + index)

  function moveMonth(delta) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  async function saveRequest(form) {
    if (modal?.type === 'change') await createVacationChangeRequest(modal.request, user.uid, form)
    else await createVacationRequest(user.uid, form)
    await reload()
    setModal(null)
    setToast(modal?.type === 'change' ? 'Änderungsantrag gesendet.' : 'Urlaubsantrag gesendet.')
  }

  return <div className="vacation-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<section className="vacation-calendar-card"><div className="vacation-toolbar"><div className="vacation-toolbar__period"><label className="filter-field"><span className="sr-only">Monat</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label><label className="filter-field"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="vacation-nav-button" type="button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat">‹</button><button className="vacation-nav-button" type="button" onClick={() => moveMonth(1)} aria-label="Nächster Monat">›</button></div><div className="vacation-toolbar__filters"><label className="filter-field"><span className="sr-only">Abteilung</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setEmployee('all') }}><option value="all">Alle Abteilungen</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-field"><span className="sr-only">Mitarbeiter</span><select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="all">Alle Mitarbeiter</option>{selectableUsers.map((item) => <option key={item.id} value={item.id}>{displayName(item)}</option>)}</select></label></div></div>{error && <p className="form-error">{error}</p>}{loading ? <p className="vacation-state">Kalender wird geladen …</p> : <><div className="vacation-calendar" aria-label={`Urlaubskalender ${MONTHS[month]} ${year}`}><div className="vacation-calendar__weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="vacation-calendar__days">{calendarDays.map((date, index) => { if (!date) return <div key={`empty-${index}`} className="vacation-day vacation-day--empty" />; const value = dateValue(date); const matching = visibleRequests.filter((request) => requestOverlaps(request, value, value)); const isToday = value === today; return <div key={value} className={`vacation-day ${isToday ? 'vacation-day--today' : ''}`}><time dateTime={value}>{date.getDate()}</time><div className="vacation-day__entries">{matching.slice(0, 3).map((request) => { const own = request.userId === user.uid; const owner = usersById.get(request.userId); return <span key={request.id} className={`vacation-day-entry vacation-day-entry--${request.status} ${own ? 'vacation-day-entry--own' : ''}`} title={`${displayName(owner || {})} · ${getVacationStatus(request.status).label}`}>{displayName(owner || {}).split(' ')[0]}</span> })}{matching.length > 3 && <span className="vacation-day-entry vacation-day-entry--more">+{matching.length - 3}</span>}</div></div> })}</div></div><div className="vacation-legend">{VACATION_STATUSES.map((status) => <span key={status.value} className={`vacation-legend__item vacation-legend__item--${status.value}`}>{status.label}</span>)}</div></>}</section><aside className="vacation-sidebar"><section className="vacation-summary-card"><div className="vacation-card-heading"><div><h2>Mein Urlaub</h2><p>{year}</p></div><button className="button" type="button" onClick={() => setModal({ type: 'new' })}>Urlaub beantragen</button></div><dl className="vacation-summary"><div><dt>Jahresanspruch</dt><dd>{summary.allowance}</dd></div><div><dt>Resturlaub Vorjahr</dt><dd>{summary.carryover}</dd></div><div><dt>Bereits genommen</dt><dd>{summary.taken}</dd></div><div><dt>Geplant / genehmigt</dt><dd>{summary.planned}</dd></div><div><dt>Ausstehend</dt><dd>{summary.pending}</dd></div><div className="vacation-summary__available"><dt>Noch verfügbar</dt><dd>{summary.remaining}</dd></div></dl></section><section className="vacation-list-card"><div className="vacation-card-heading"><div><h2>Meine Urlaube</h2></div><label className="filter-field"><span className="sr-only">Jahr filtern</span><select value={listYear} onChange={(event) => setListYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><div className="vacation-request-list">{loading ? <p className="vacation-state">Urlaube werden geladen …</p> : ownList.length ? ownList.map((request) => <button className="vacation-request" key={request.id} type="button" onClick={() => setSelectedRequest(request)}><span className="vacation-request__period">{formatVacationPeriod(request)}</span><span className="vacation-request__meta">{request.days ?? businessDays(request.startDate, request.endDate)} Tage <StatusBadge status={request.status} /></span>{request.note && <span className="vacation-request__note">{request.note}</span>}</button>) : <p className="vacation-state">Keine Urlaubsanträge in diesem Jahr.</p>}</div></section></aside>{modal && <RequestModal request={modal.type === 'change' ? modal.request : null} onClose={() => setModal(null)} onSubmit={saveRequest} />}{selectedRequest && <RequestDetail request={selectedRequest} onClose={() => setSelectedRequest(null)} onChange={() => { setModal({ type: 'change', request: selectedRequest }); setSelectedRequest(null) }} />}</div>
}
