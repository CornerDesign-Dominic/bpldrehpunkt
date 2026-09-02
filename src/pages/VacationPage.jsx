import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import Toast from '../components/ui/Toast.jsx'
import { canEdit as canApproveVacation } from '../lib/permissions.js'
import { getUserDisplayName, listUserProfiles } from '../lib/userProfiles.js'
import {
  businessDays,
  createVacationChangeRequest,
  createVacationCancellationRequest,
  createVacationRequest,
  dateValue,
  formatVacationDate,
  formatVacationPeriod,
  getVacationStatus,
  listVacationCalendarItems,
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

function vacationApproverEmails(users, requesterId) {
  return [...new Set(users
    .filter((item) => item.id !== requesterId && item.active !== false && canApproveVacation(item, 'vacation'))
    .map((item) => item.email?.trim())
    .filter(Boolean))]
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
  const [profiles, requests, calendarItems] = await Promise.all([listUserProfiles(), listVacationRequests(currentUser.uid), listVacationCalendarItems()])
  const ownProfile = { id: currentUser.uid, ...currentProfile, email: currentUser.email || currentProfile?.email }
  return { users: profiles.some((item) => item.id === currentUser.uid) ? profiles : [...profiles, ownProfile], requests, ...calendarItems }
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
  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal vacation-modal--detail" role="dialog" aria-modal="true" aria-labelledby="vacation-detail-title"><div className="vacation-modal__heading"><div><h2 id="vacation-detail-title">Urlaubsantrag</h2><p>{formatVacationPeriod(request)}</p></div><button className="vacation-modal__close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button></div><dl className="vacation-detail-list"><div><dt>Urlaubstage</dt><dd>{request.days ?? businessDays(request.startDate, request.endDate)}</dd></div><div><dt>Status</dt><dd><StatusBadge status={request.status} /></dd></div>{request.note && <div className="vacation-detail-list__wide"><dt>Notiz</dt><dd>{request.note}</dd></div>}{request.originalRequestId && <div className="vacation-detail-list__wide"><dt>Bezug</dt><dd>Änderungsantrag zu einem bestehenden Urlaub.</dd></div>}</dl><div className="vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Schließen</button>{onChange && <button className="button" type="button" onClick={onChange}>Änderung beantragen</button>}</div></section></div>
}

function RequestPicker({ mode, requests, onClose, onSelect }) {
  const title = mode === 'change' ? 'Urlaub für Änderung auswählen' : 'Urlaub für Storno auswählen'
  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal vacation-modal--picker" role="dialog" aria-modal="true" aria-labelledby="vacation-picker-title"><div className="vacation-modal__heading"><div><h2 id="vacation-picker-title">{title}</h2><p>Der ursprüngliche Antrag bleibt unverändert.</p></div><button className="vacation-modal__close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button></div><div className="vacation-picker-list">{requests.length ? requests.map((request) => <button key={request.id} className="vacation-picker-item" type="button" onClick={() => onSelect(request)}><strong>{formatVacationPeriod(request)}</strong><span>{request.days ?? businessDays(request.startDate, request.endDate)} Tage <StatusBadge status={request.status} /></span></button>) : <p className="vacation-state">Keine eigenen Urlaubsanträge verfügbar.</p>}</div></section></div>
}

function CancellationModal({ request, onClose, onSubmit }) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onSubmit({ note })
    } catch {
      setError('Der Stornoantrag konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal" role="dialog" aria-modal="true" aria-labelledby="vacation-cancellation-title"><div className="vacation-modal__heading"><div><h2 id="vacation-cancellation-title">Storno beantragen</h2><p>{formatVacationPeriod(request)} · {request.days ?? businessDays(request.startDate, request.endDate)} Tage</p></div><button className="vacation-modal__close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button></div><form onSubmit={submit} noValidate><label className="form-field"><span>Notiz (optional)</span><textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<div className="vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gesendet …' : 'Stornoantrag senden'}</button></div></form></section></div>
}

export default function VacationPage() {
  const { canEdit } = usePermissions()
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
  const [holidays, setHolidays] = useState([])
  const [vacationBlocks, setVacationBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [picker, setPicker] = useState(null)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [listYear, setListYear] = useState(currentYear)
  const [toast, setToast] = useState('')

  async function reload() {
    const result = await loadVacationData(user, profile)
    setUsers(result.users)
    setRequests(result.requests)
    setHolidays(result.holidays)
    setVacationBlocks(result.blocks)
  }

  async function notifyVacationApprovers(notification) {
    const recipients = vacationApproverEmails(users, user.uid)
    if (!recipients.length) return 'no-recipient'

    const outcomes = await Promise.all(recipients.map(async (to) => {
      try {
        const response = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, ...notification }),
        })
        return response.ok
      } catch {
        return false
      }
    }))

    return outcomes.every(Boolean) ? 'sent' : 'failed'
  }

  useEffect(() => {
    let active = true
    loadVacationData(user, profile)
      .then((result) => {
        if (!active) return
        setUsers(result.users)
        setRequests(result.requests)
        setHolidays(result.holidays)
        setVacationBlocks(result.blocks)
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
    return !request.originalRequestId
      && requestOverlaps(request, `${year}-${String(month + 1).padStart(2, '0')}-01`, `${year}-${String(month + 1).padStart(2, '0')}-31`)
      && (isOwn || request.status === 'approved')
      && (department === 'all' || owner?.department?.trim() === department)
      && (employee === 'all' || request.userId === employee)
  }), [department, employee, month, requests, user.uid, usersById, year])
  const ownRequests = useMemo(() => requests.filter((request) => request.userId === user.uid), [requests, user.uid])
  const selectableOwnRequests = useMemo(() => ownRequests.filter((request) => !request.originalRequestId && request.status !== 'rejected').sort((left, right) => right.startDate.localeCompare(left.startDate)), [ownRequests])
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
    const isChange = modal?.type === 'change'
    const originalRequest = modal?.request
    const applicantName = getUserDisplayName(profile, user)
    if (isChange) await createVacationChangeRequest(originalRequest, user.uid, form)
    else await createVacationRequest(user.uid, form)

    setModal(null)
    const notification = isChange
      ? {
          type: 'vacation_change',
          subject: `Urlaub [Änderung] - ${applicantName}`,
          message: `${applicantName} hat eine Änderung für den Urlaub vom ${formatVacationDate(originalRequest.startDate)} bis ${formatVacationDate(originalRequest.endDate)} beantragt.\n\nGewünschter Zeitraum:\n${formatVacationDate(form.startDate)} bis ${formatVacationDate(form.endDate)}\n\nBitte im Drehpunkt prüfen.`,
        }
      : {
          type: 'vacation_request',
          subject: `Urlaub [Antrag] - ${applicantName}`,
          message: `${applicantName} hat einen Urlaubsantrag für den Zeitraum ${formatVacationDate(form.startDate)} bis ${formatVacationDate(form.endDate)} gestellt.\n\nBitte im Drehpunkt prüfen.`,
        }
    const notificationResult = await notifyVacationApprovers(notification)
    await reload().catch(() => undefined)
    const successMessage = isChange ? 'Änderungsantrag gesendet.' : 'Urlaubsantrag gesendet.'
    setToast(notificationResult === 'failed' ? `${successMessage} Benachrichtigung konnte nicht vollständig gesendet werden.` : notificationResult === 'no-recipient' ? `${successMessage} Kein zuständiger Genehmiger mit Urlaubsberechtigung hinterlegt.` : successMessage)
  }

  async function saveCancellation(form) {
    const originalRequest = modal.request
    const applicantName = getUserDisplayName(profile, user)
    await createVacationCancellationRequest(originalRequest, user.uid, form)
    setModal(null)
    const notificationResult = await notifyVacationApprovers({
      type: 'vacation_cancel',
      subject: `Urlaub [Storno] - ${applicantName}`,
      message: `${applicantName} hat die Stornierung des Urlaubs vom ${formatVacationDate(originalRequest.startDate)} bis ${formatVacationDate(originalRequest.endDate)} beantragt.\n\nBitte im Drehpunkt prüfen.`,
    })
    await reload().catch(() => undefined)
    setToast(notificationResult === 'failed' ? 'Stornoantrag gesendet. Benachrichtigung konnte nicht vollständig gesendet werden.' : notificationResult === 'no-recipient' ? 'Stornoantrag gesendet. Kein zuständiger Genehmiger mit Urlaubsberechtigung hinterlegt.' : 'Stornoantrag gesendet.')
  }

  const editable = canEdit('vacation')
  return <div className="vacation-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <section className="vacation-calendar-card">
      <div className="vacation-toolbar"><div className="vacation-toolbar__period"><label className="filter-field"><span className="sr-only">Monat</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label><label className="filter-field"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="vacation-nav-button" type="button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat">‹</button><button className="vacation-nav-button" type="button" onClick={() => moveMonth(1)} aria-label="Nächster Monat">›</button></div><div className="vacation-toolbar__filters"><label className="filter-field"><span className="sr-only">Abteilung</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setEmployee('all') }}><option value="all">Alle Abteilungen</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-field"><span className="sr-only">Mitarbeiter</span><select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="all">Alle Mitarbeiter</option>{selectableUsers.map((item) => <option key={item.id} value={item.id}>{displayName(item)}</option>)}</select></label></div></div>
      {error && <p className="form-error">{error}</p>}
      {loading ? <p className="vacation-state">Kalender wird geladen …</p> : <><div className="vacation-calendar" aria-label={`Urlaubskalender ${MONTHS[month]} ${year}`}><div className="vacation-calendar__weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="vacation-calendar__days">{calendarDays.map((date, index) => {
        if (!date) return <div key={`empty-${index}`} className="vacation-day vacation-day--empty" />
        const value = dateValue(date)
        const matching = [
          ...holidays.filter((item) => requestOverlaps(item, value, value)).map((item) => ({ ...item, kind: 'holiday' })),
          ...vacationBlocks.filter((item) => requestOverlaps(item, value, value)).map((item) => ({ ...item, kind: 'block' })),
          ...visibleRequests.filter((item) => requestOverlaps(item, value, value)).map((item) => ({ ...item, kind: 'vacation' })),
        ]
        return <div key={value} className={`vacation-day ${value === today ? 'vacation-day--today' : ''}`}><time dateTime={value}>{date.getDate()}</time><div className="vacation-day__entries">{matching.slice(0, 3).map((item) => {
          const owner = usersById.get(item.userId)
          const label = item.kind === 'vacation' ? displayName(owner || {}).split(' ')[0] : item.label
          const kindClass = item.kind === 'vacation' ? item.status : item.kind
          return <span key={`${item.kind}-${item.id}`} className={`vacation-day-entry vacation-day-entry--${kindClass} ${item.userId === user.uid ? 'vacation-day-entry--own' : ''}`} title={item.kind === 'vacation' ? `${displayName(owner || {})} · ${getVacationStatus(item.status).label}` : item.label}>{label}</span>
        })}{matching.length > 3 && <span className="vacation-day-entry vacation-day-entry--more">+{matching.length - 3}</span>}</div></div>
      })}</div></div><div className="vacation-legend"><span className="vacation-legend__item vacation-legend__item--holiday">Feiertag</span><span className="vacation-legend__item vacation-legend__item--approved">Genehmigter Urlaub</span><span className="vacation-legend__item vacation-legend__item--block">Urlaubssperre</span></div></>}
    </section>
    <aside className="vacation-sidebar">
      <section className="vacation-summary-card"><div className="vacation-card-heading"><div><h2>Mein Urlaub</h2><p>{year}</p></div></div><dl className="vacation-summary"><div><dt>Jahresanspruch</dt><dd>{summary.allowance}</dd></div><div><dt>Resturlaub Vorjahr</dt><dd>{summary.carryover}</dd></div><div><dt>Bereits genommen</dt><dd>{summary.taken}</dd></div><div><dt>Geplant / genehmigt</dt><dd>{summary.planned}</dd></div><div><dt>Ausstehend</dt><dd>{summary.pending}</dd></div><div className="vacation-summary__available"><dt>Noch verfügbar</dt><dd>{summary.remaining}</dd></div></dl></section>
      {editable && <section className="vacation-actions" aria-label="Urlaubsaktionen"><button className="button button--secondary" type="button" onClick={() => setModal({ type: 'new' })}>Urlaub beantragen</button><button className="button button--secondary" type="button" onClick={() => setPicker('change')}>Änderung beantragen</button><button className="button button--secondary" type="button" onClick={() => setPicker('cancellation')}>Storno beantragen</button></section>}
      <section className="vacation-list-card"><div className="vacation-card-heading"><div><h2>Meine Urlaube</h2></div><label className="filter-field"><span className="sr-only">Jahr filtern</span><select value={listYear} onChange={(event) => setListYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><div className="vacation-request-list">{loading ? <p className="vacation-state">Urlaube werden geladen …</p> : ownList.length ? ownList.map((request) => <button className="vacation-request" key={request.id} type="button" onClick={() => setSelectedRequest(request)}><span className="vacation-request__period">{formatVacationPeriod(request)}</span><span className="vacation-request__meta">{request.days ?? businessDays(request.startDate, request.endDate)} Tage <StatusBadge status={request.status} /></span>{request.note && <span className="vacation-request__note">{request.note}</span>}</button>) : <p className="vacation-state">Keine Urlaubsanträge in diesem Jahr.</p>}</div></section>
    </aside>
    {picker && <RequestPicker mode={picker} requests={selectableOwnRequests} onClose={() => setPicker(null)} onSelect={(request) => { setModal({ type: picker, request }); setPicker(null) }} />}
    {(modal?.type === 'new' || modal?.type === 'change') && <RequestModal request={modal.type === 'change' ? modal.request : null} onClose={() => setModal(null)} onSubmit={saveRequest} />}
    {modal?.type === 'cancellation' && <CancellationModal request={modal.request} onClose={() => setModal(null)} onSubmit={saveCancellation} />}
    {selectedRequest && <RequestDetail request={selectedRequest} onClose={() => setSelectedRequest(null)} onChange={editable ? () => { setModal({ type: 'change', request: selectedRequest }); setSelectedRequest(null) } : null} />}
  </div>
}
