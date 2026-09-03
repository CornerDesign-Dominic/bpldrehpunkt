import { formatVacationDate, getVacationType } from './vacationRequests.js'

const requestKinds = {
  request: { label: 'Urlaubsantrag', managerHeading: 'Ein Urlaubsantrag ist eingegangen.', type: 'vacation_request' },
  change: { label: 'Änderungsantrag', managerHeading: 'Ein Änderungsantrag ist eingegangen.', type: 'vacation_change_request' },
  cancellation: { label: 'Stornoantrag', managerHeading: 'Ein Stornoantrag ist eingegangen.', type: 'vacation_cancel_request' },
}

function nameOf(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.name || user?.employeeName || user?.email || '—'
}

function departmentKey(user) {
  return user?.departmentId || user?.department?.trim() || ''
}

function requestKind(request) {
  if (request?.requestKind === 'cancellation' || request?.cancellationRequest) return 'cancellation'
  return request?.originalRequestId || request?.changeRequest ? 'change' : 'request'
}

function commentOf(request, field = 'requestComment') {
  const value = request?.[field] || (field === 'requestComment' ? request?.note : '')
  return typeof value === 'string' && value.trim() ? value.trim() : '–'
}

function requestDetails(request, kind) {
  const details = kind === 'change' ? request.changeRequest || {} : kind === 'cancellation' ? request.cancellationRequest || {} : {}
  const lines = kind === 'change'
    ? [`Bisheriger Zeitraum: ${formatVacationDate(details.originalStartDate)} – ${formatVacationDate(details.originalEndDate)}`, `Neuer Zeitraum: ${formatVacationDate(request.startDate)} – ${formatVacationDate(request.endDate)}`]
    : [`Zeitraum: ${formatVacationDate(request.startDate)} – ${formatVacationDate(request.endDate)}`]
  return [...lines, `Urlaubstage: ${request.days ?? '–'}`, `Urlaubsart: ${getVacationType(request.vacationType).label}`, `Kommentar: ${commentOf(request)}`]
}

async function sendNotification(to, subject, message, type) {
  if (typeof to !== 'string' || !to.trim()) return false
  try {
    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to.trim(), subject, message, type }),
    })
    return response.ok
  } catch {
    return false
  }
}

async function sendToMany(recipients, subject, message, type) {
  const uniqueRecipients = [...new Set(recipients.map((recipient) => recipient?.trim().toLowerCase()).filter(Boolean))]
  const results = await Promise.all(uniqueRecipients.map((recipient) => sendNotification(recipient, subject, message, type)))
  return results.every(Boolean)
}

export function vacationManagerEmails(users = [], applicant) {
  const applicantDepartment = departmentKey(applicant)
  if (!applicantDepartment) return []
  return [...new Set((Array.isArray(users) ? users : [])
    .filter((user) => user?.active !== false && user?.vacationManager === true && (user.vacationManagerAllDepartments === true || (Array.isArray(user.vacationManagerDepartments) && user.vacationManagerDepartments.includes(applicantDepartment))))
    .map((user) => user.email?.trim().toLowerCase())
    .filter(Boolean))]
}

export async function notifyVacationSubmission({ applicant, request, users }) {
  try {
    const kind = requestKind(request)
    const config = requestKinds[kind]
    const applicantName = nameOf(applicant)
    const subject = `Urlaub [${kind === 'request' ? 'Antrag' : kind === 'change' ? 'Änderung' : 'Storno'}] - ${applicantName}`
    const details = requestDetails(request, kind).join('\n')
    const applicantMessage = `Dein ${config.label} wurde versendet.\n\nDein ${config.label}:\n\n${details}\n\nStatus:\nAusstehend`
    const managerMessage = `${config.managerHeading}\n\nVon: ${applicantName}\nAbteilung: ${applicant?.departmentName || applicant?.department || '–'}\n${details}\n\nBitte im Drehpunkt prüfen.`
    const [applicantSent, managersSent] = await Promise.all([
      sendNotification(applicant?.email, subject, applicantMessage, config.type),
      sendToMany(vacationManagerEmails(users, applicant), subject, managerMessage, config.type),
    ])
    return applicantSent && managersSent
  } catch {
    return false
  }
}

export async function notifyVacationDecision({ request, decision }) {
  try {
    const kind = requestKind(request)
    const config = requestKinds[kind]
    const applicantName = nameOf(request)
    const action = decision === 'approved' ? 'genehmigt' : 'abgelehnt'
    const managerComment = commentOf(request, 'managerComment')
    const details = requestDetails(request, kind).filter((line) => !line.startsWith('Kommentar: '))
    if (managerComment !== '–') details.push(`Kommentar des Genehmigers: ${managerComment}`)
    const message = `Dein ${config.label} wurde ${action}.\n\n${config.label}:\n\n${details.join('\n')}\n\nStatus:\n${decision === 'approved' ? 'Genehmigt' : 'Abgelehnt'}`
    return sendNotification(request?.employeeEmail, `Urlaub [${decision === 'approved' ? 'Genehmigt' : 'Abgelehnt'}] - ${applicantName}`, message, decision === 'approved' ? 'vacation_approved' : 'vacation_rejected')
  } catch {
    return false
  }
}
