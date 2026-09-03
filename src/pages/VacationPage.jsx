import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import VacationCalendar from '../components/vacation/VacationCalendar.jsx'
import Toast from '../components/ui/Toast.jsx'
import { VACATION_MONTHS } from '../lib/vacationCalendar.js'
import { canEdit as canApproveVacation } from '../lib/permissions.js'
import { getUserDisplayName, listUserProfiles } from '../lib/userProfiles.js'
import {
  businessDays,
  createVacationChangeRequest,
  createVacationCancellationRequest,
  createVacationRequest,
  formatVacationDate,
  formatVacationPeriod,
  getVacationStatus,
  getVacationType,
  listVacationCalendarItems,
  listVacationRequests,
  reducesVacationAllowance,
  requestOverlaps,
  todayValue,
} from '../lib/vacationRequests.js'
import '../styles/vacation.css'

function displayName(profile) {
  return getUserDisplayName(profile, profile)
}

function vacationApproverEmails(users, requesterId) {
  return [...new Set(users
    .filter((item) => item.id !== requesterId && item.active !== false && canApproveVacation(item, 'vacation'))
    .map((item) => item.email?.trim())
    .filter(Boolean))]
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
  if (!reducesVacationAllowance(request)) return 0
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
  const initialStartDate = request?.startDate || todayValue()
  const initialEndDate = request?.endDate || todayValue()
  const [form, setForm] = useState({ startDate: initialStartDate, endDate: initialEndDate, days: String(request?.days ?? businessDays(initialStartDate, initialEndDate)), vacationType: getVacationType(request?.vacationType).value, requestComment: '' })
  const [daysEdited, setDaysEdited] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const suggestedDays = businessDays(form.startDate, form.endDate)
  const days = Number(form.days)

  function setDate(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'startDate') next.endDate = value
      if (field === 'endDate' && value < current.startDate) next.endDate = current.startDate
      return { ...next, days: String(businessDays(next.startDate, next.endDate)) }
    })
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.startDate || !form.endDate || form.endDate < form.startDate || !form.days.trim() || !Number.isFinite(days) || days < 0) {
      setError('Bitte Zeitraum und Urlaubstage gültig angeben.')
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

  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal" role="dialog" aria-modal="true" aria-labelledby="vacation-modal-title"><div className="vacation-modal__heading"><div><h2 id="vacation-modal-title">{isChange ? 'Änderung beantragen' : 'Urlaub beantragen'}</h2>{isChange && <p>Der ursprüngliche Antrag bleibt unverändert erhalten.</p>}</div><button className="vacation-modal__close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button></div><form onSubmit={submit} noValidate><div className="vacation-modal__fields"><label className="form-field"><span>Von</span><input type="date" value={form.startDate} onChange={(event) => setDate('startDate', event.target.value)} /></label><label className="form-field"><span>Bis</span><input type="date" min={form.startDate} value={form.endDate} onChange={(event) => setDate('endDate', event.target.value)} /></label><label className="form-field vacation-form-days"><span>Urlaubstage</span><input type="number" min="0" step="0.5" required value={form.days} onChange={(event) => { setDaysEdited(true); setForm((current) => ({ ...current, days: event.target.value })) }} />{!daysEdited && <small>Vorschlag aus Zeitraum: {suggestedDays}</small>}</label><label className="form-field vacation-form-type"><span>Urlaubsart</span><select required value={form.vacationType} onChange={(event) => setForm((current) => ({ ...current, vacationType: event.target.value }))}><option value="normal">Normal</option><option value="overtime">Überstundenabbau</option><option value="special">Sonderurlaub</option></select></label><label className="form-field vacation-modal__note"><span>Kommentar (optional)</span><textarea rows="3" value={form.requestComment} onChange={(event) => setForm((current) => ({ ...current, requestComment: event.target.value }))} /></label></div>{error && <p className="form-error">{error}</p>}<div className="vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gesendet …' : isChange ? 'Änderungsantrag senden' : 'Antrag senden'}</button></div></form></section></div>
}

function RequestDetail({ request, onClose, onChange, onCancel }) {
  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal vacation-modal--detail" role="dialog" aria-modal="true" aria-labelledby="vacation-detail-title"><div className="vacation-modal__heading"><div><h2 id="vacation-detail-title">Urlaubsantrag</h2><p>{formatVacationPeriod(request)}</p></div><button className="vacation-modal__close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button></div><dl className="vacation-detail-list"><div><dt>Urlaubsart</dt><dd>{getVacationType(request.vacationType).label}</dd></div><div><dt>Urlaubstage</dt><dd>{request.days ?? businessDays(request.startDate, request.endDate)}</dd></div><div><dt>Status</dt><dd><StatusBadge status={request.status} /></dd></div><div className="vacation-detail-list__wide"><dt>Kommentar des Mitarbeiters</dt><dd>{request.requestComment || request.note || 'Kein Kommentar'}</dd></div>{request.managerComment !== undefined && <div className="vacation-detail-list__wide"><dt>Kommentar des Genehmigers</dt><dd>{request.managerComment || 'Kein Kommentar'}</dd></div>}{request.originalRequestId && <div className="vacation-detail-list__wide"><dt>Bezug</dt><dd>Änderungsantrag zu einem bestehenden Urlaub.</dd></div>}</dl><div className="vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Schließen</button>{onCancel && <button className="button button--secondary" type="button" onClick={onCancel}>Storno beantragen</button>}{onChange && <button className="button" type="button" onClick={onChange}>Änderung beantragen</button>}</div></section></div>
}

function requestSortValue(request) {
  const timestamp = request.updatedAt || request.createdAt || request.processedAt
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis()
  if (timestamp instanceof Date) return timestamp.getTime()
  if (typeof timestamp === 'string') return Date.parse(timestamp) || 0
  return 0
}

function latestRequest(requests) {
  return [...requests].sort((left, right) => requestSortValue(right) - requestSortValue(left) || (right.startDate || '').localeCompare(left.startDate || '') || (right.id || '').localeCompare(left.id || ''))[0]
}

function CancellationModal({ request, onClose, onSubmit }) {
  const [requestComment, setRequestComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onSubmit({ requestComment })
    } catch {
      setError('Der Stornoantrag konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="vacation-modal" role="dialog" aria-modal="true" aria-labelledby="vacation-cancellation-title"><div className="vacation-modal__heading"><div><h2 id="vacation-cancellation-title">Storno beantragen</h2><p>{formatVacationPeriod(request)} · {request.days ?? businessDays(request.startDate, request.endDate)} Tage</p></div><button className="vacation-modal__close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button></div><form onSubmit={submit} noValidate><label className="form-field"><span>Kommentar (optional)</span><textarea rows="3" value={requestComment} onChange={(event) => setRequestComment(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<div className="vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gesendet …' : 'Stornoantrag senden'}</button></div></form></section></div>
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
  const ownRelatedByOriginal = useMemo(() => ownRequests.filter((request) => request.originalRequestId).reduce((map, request) => { const related = map.get(request.originalRequestId) || []; related.push(request); map.set(request.originalRequestId, related); return map }, new Map()), [ownRequests])
  const ownList = useMemo(() => ownRequests.filter((request) => {
    if (!request.originalRequestId) return !ownRelatedByOriginal.has(request.id)
    return latestRequest(ownRelatedByOriginal.get(request.originalRequestId) || [])?.id === request.id
  }).filter((request) => requestOverlaps(request, `${listYear}-01-01`, `${listYear}-12-31`)).sort((left, right) => right.startDate.localeCompare(left.startDate)), [listYear, ownRelatedByOriginal, ownRequests])
  const summary = useMemo(() => {
    const relevant = ownRequests.filter((request) => request.status === 'approved' && requestOverlaps(request, `${year}-01-01`, `${year}-12-31`))
    const taken = relevant.filter((request) => request.endDate < today).reduce((sum, request) => sum + requestDaysInYear(request, year), 0)
    const planned = relevant.filter((request) => request.endDate >= today).reduce((sum, request) => sum + requestDaysInYear(request, year), 0)
    const pending = ownRequests.filter((request) => request.status === 'pending' && requestOverlaps(request, `${year}-01-01`, `${year}-12-31`)).reduce((sum, request) => sum + requestDaysInYear(request, year), 0)
    const allowance = vacationAllowance(profile)
    const carryover = previousYearCarryover(profile)
    return { allowance, carryover, taken, planned, pending, remaining: allowance + carryover - taken - planned }
  }, [ownRequests, profile, today, year])
  const years = Array.from({ length: 7 }, (_, index) => currentYear - 2 + index)

  const calendarEntries = useMemo(() => [
    ...holidays.map((item) => ({ id: `holiday-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: item.label, kind: 'holiday' })),
    ...vacationBlocks.map((item) => ({ id: `block-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: item.label, kind: 'block' })),
    ...visibleRequests.flatMap((item) => {
      const owner = usersById.get(item.userId)
      const ownerName = displayName(owner || {})
      const related = ownRelatedByOriginal.get(item.id) || []
      const latestChange = latestRequest(related.filter((request) => request.status === 'change_requested' || request.changeRequest))
      const pendingCancellation = latestRequest(related.filter((request) => request.status === 'cancellation_requested'))
      const own = item.userId === user.uid

      if (latestChange?.status === 'approved') return [{ id: `change-${latestChange.id}`, startDate: latestChange.startDate, endDate: latestChange.endDate, label: ownerName.split(' ')[0], kind: 'approved', own, title: `${ownerName} · Änderung genehmigt` }]
      if (latestChange?.status === 'change_requested') return [
        { id: `vacation-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: `${ownerName.split(' ')[0]} · Änderung angefragt`, kind: item.status, modifier: 'change_requested', own, title: `${ownerName} · Änderung angefragt` },
        { id: `change-${latestChange.id}`, startDate: latestChange.startDate, endDate: latestChange.endDate, label: `${ownerName.split(' ')[0]} · Änderung angefragt`, kind: 'pending', own, title: `${ownerName} · Änderung angefragt` },
      ]

      const annotation = pendingCancellation ? 'Storno angefragt' : ''
      return [{ id: `vacation-${item.id}`, startDate: item.startDate, endDate: item.endDate, label: `${ownerName.split(' ')[0]}${annotation ? ` · ${annotation}` : ''}`, kind: item.status, modifier: pendingCancellation ? 'cancellation_requested' : '', own, title: `${ownerName} · ${annotation || getVacationStatus(item.status).label}` }]
    }),
  ], [holidays, ownRelatedByOriginal, user.uid, usersById, vacationBlocks, visibleRequests])

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
  const selectedBaseRequest = selectedRequest?.originalRequestId ? ownRequests.find((request) => request.id === selectedRequest.originalRequestId) || selectedRequest : selectedRequest
  return <div className="vacation-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <section className="vacation-calendar-card">
      <div className="vacation-toolbar"><div className="vacation-toolbar__period"><label className="filter-field"><span className="sr-only">Monat</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{VACATION_MONTHS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label><label className="filter-field"><span className="sr-only">Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="vacation-nav-button" type="button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat">‹</button><button className="vacation-nav-button" type="button" onClick={() => moveMonth(1)} aria-label="Nächster Monat">›</button></div><div className="vacation-toolbar__filters"><label className="filter-field"><span className="sr-only">Abteilung</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setEmployee('all') }}><option value="all">Alle Abteilungen</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-field"><span className="sr-only">Mitarbeiter</span><select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="all">Alle Mitarbeiter</option>{selectableUsers.map((item) => <option key={item.id} value={item.id}>{displayName(item)}</option>)}</select></label></div></div>
      {error && <p className="form-error">{error}</p>}
      {loading ? <p className="vacation-state">Kalender wird geladen …</p> : <><VacationCalendar year={year} month={month} today={today} entries={calendarEntries} /><div className="vacation-legend"><span className="vacation-legend__item vacation-legend__item--holiday">Feiertag</span><span className="vacation-legend__item vacation-legend__item--approved">Genehmigter Urlaub</span><span className="vacation-legend__item vacation-legend__item--block">Urlaubssperre</span></div></>}
    </section>
    <aside className="vacation-sidebar">
      <section className="vacation-summary-card"><div className="vacation-card-heading"><div><h2>Mein Urlaub</h2><p>{year}</p></div></div><dl className="vacation-summary"><div><dt>Jahresanspruch</dt><dd>{summary.allowance}</dd></div><div><dt>Resturlaub Vorjahr</dt><dd>{summary.carryover}</dd></div><div><dt>Bereits genommen</dt><dd>{summary.taken}</dd></div><div><dt>Geplant / genehmigt</dt><dd>{summary.planned}</dd></div><div><dt>Ausstehend</dt><dd>{summary.pending}</dd></div><div className="vacation-summary__available"><dt>Noch verfügbar</dt><dd>{summary.remaining}</dd></div></dl></section>
      <section className="vacation-list-card"><div className="vacation-card-heading"><div><h2>Meine Urlaube</h2><label className="filter-field vacation-list-year"><span className="sr-only">Jahr filtern</span><select value={listYear} onChange={(event) => setListYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>{editable && <button className="button" type="button" onClick={() => setModal({ type: 'new' })}>Urlaub beantragen</button>}</div><div className="vacation-request-list">{loading ? <p className="vacation-state">Urlaube werden geladen …</p> : ownList.length ? ownList.map((request) => <button className="vacation-request" key={request.id} type="button" onClick={() => setSelectedRequest(request)}><span className="vacation-request__period">{formatVacationPeriod(request)}</span><span className="vacation-request__meta">{request.days ?? businessDays(request.startDate, request.endDate)} Tage · {getVacationType(request.vacationType).label} <StatusBadge status={request.status} /></span>{request.note && <span className="vacation-request__note">{request.note}</span>}</button>) : <p className="vacation-state">Keine Urlaubsanträge in diesem Jahr.</p>}</div></section>
    </aside>
    {(modal?.type === 'new' || modal?.type === 'change') && <RequestModal request={modal.type === 'change' ? modal.request : null} onClose={() => setModal(null)} onSubmit={saveRequest} />}
    {modal?.type === 'cancellation' && <CancellationModal request={modal.request} onClose={() => setModal(null)} onSubmit={saveCancellation} />}
    {selectedRequest && <RequestDetail request={selectedRequest} onClose={() => setSelectedRequest(null)} onChange={editable && selectedBaseRequest.status !== 'rejected' ? () => { setModal({ type: 'change', request: selectedBaseRequest }); setSelectedRequest(null) } : null} onCancel={editable && selectedBaseRequest.status !== 'rejected' ? () => { setModal({ type: 'cancellation', request: selectedBaseRequest }); setSelectedRequest(null) } : null} />}
  </div>
}
