import { listDamageCaseDeadlines, listDamageCases } from './damages.js'
import { listInsolvencies, listInsolvencyDeadlines } from './insolvencies.js'
import { listLegalDisputeDeadlines, listLegalDisputes } from './legalDisputes.js'
import { listInkassoCaseDeadlines, listInkassoCases } from './inkasso.js'
import { canView } from './permissions.js'
import { insolvencyCasePath } from './businessPartnerLinks.js'

// System calendars are virtual: their entries stay in the source case files.
// That keeps the calendar current without creating a second, editable event.
export const SYSTEM_CALENDARS = [
  { id: 'system-damages', name: 'Schäden', module: 'damages', color: '#a66a5a' },
  { id: 'system-insolvencies', name: 'Insolvenzen', module: 'insolvencies', color: '#806b96' },
  { id: 'system-legal-disputes', name: 'Gericht / Streit', module: 'legalDisputes', color: '#5d7e99' },
  { id: 'system-inkasso', name: 'Inkasso', module: 'inkasso', color: '#778b5c' },
]

const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const text = (value) => typeof value === 'string' ? value.trim() : ''

function systemEvent(calendar, id, title, date, targetPath, description = '', { time = '', reminderEnabled = false, hasReminder = false } = {}) {
  return {
    id,
    calendarId: calendar.id,
    calendarName: calendar.name,
    calendarColor: calendar.color,
    title,
    description,
    startDate: date,
    endDate: date,
    allDay: !time,
    startTime: time || '',
    endTime: time || '',
    reminderEnabled: reminderEnabled === true,
    hasReminder: hasReminder === true,
    systemCalendar: true,
    targetPath,
  }
}

function deadlineDescription(description, deadline) {
  const reminder = deadline?.reminderEnabled === true ? 'Erinnerung: An' : 'Erinnerung: Aus'
  return [description, reminder].filter(Boolean).join('\n')
}

export function listSystemCalendars(profile) {
  return SYSTEM_CALENDARS
    .filter((calendar) => canView(profile, calendar.module))
    .map((calendar) => ({ ...calendar, kind: 'system', accessLevel: 'view', systemCalendar: true }))
}

async function damageEvents(calendar) {
  const damageCases = await listDamageCases()
  const deadlineLists = await Promise.all(damageCases.map(async (damageCase) => ({
    damageCase,
    deadlines: await listDamageCaseDeadlines(damageCase.id),
  })))
  return deadlineLists.flatMap(({ damageCase, deadlines }) => deadlines
    .filter((deadline) => validDate(deadline.date))
    .map((deadline) => systemEvent(
      calendar,
      `damage:${damageCase.id}:${deadline.id}`,
      `${damageCase.caseNumber || 'Schadenfall'} · ${text(deadline.note) || 'Termin / Frist'}`,
      deadline.date,
      `/schaeden/${damageCase.id}`,
      deadlineDescription(text(damageCase.title), deadline),
      { time: text(deadline.time), reminderEnabled: deadline.reminderEnabled, hasReminder: true },
    )))
}

async function insolvencyEvents(calendar) {
  const insolvencies = await listInsolvencies()
  const deadlineLists = await Promise.all(insolvencies.map(async (insolvency) => ({
    insolvency,
    deadlines: await listInsolvencyDeadlines(insolvency.id),
  })))
  const insolvencyDateEvents = insolvencies
    .filter((insolvency) => validDate(insolvency.insolvencyDate))
    .map((insolvency) => systemEvent(
      calendar,
      `insolvency:${insolvency.id}:insolvency-date`,
      `${text(insolvency.partnerName) || 'Insolvenzfall'} · Insolvenzeröffnung`,
      insolvency.insolvencyDate,
      insolvencyCasePath(insolvency.id),
      text(insolvency.courtReference),
    ))
  const deadlineEvents = deadlineLists.flatMap(({ insolvency, deadlines }) => deadlines
    .filter((deadline) => validDate(deadline.date))
    .map((deadline) => systemEvent(
      calendar,
      `insolvency:${insolvency.id}:deadline:${deadline.id}`,
      `${text(insolvency.partnerName) || 'Insolvenzfall'} · ${text(deadline.note) || 'Termin / Frist'}`,
      deadline.date,
      insolvencyCasePath(insolvency.id),
      deadlineDescription(text(insolvency.courtReference), deadline),
      { time: text(deadline.time), reminderEnabled: deadline.reminderEnabled, hasReminder: true },
    )))
  return [...insolvencyDateEvents, ...deadlineEvents]
}

async function legalDisputeEvents(calendar) {
  const legalDisputes = await listLegalDisputes()
  const deadlineLists = await Promise.all(legalDisputes.map(async (legalDispute) => ({
    legalDispute,
    deadlines: await listLegalDisputeDeadlines(legalDispute.id),
  })))
  return deadlineLists.flatMap(({ legalDispute, deadlines }) => {
    const title = text(legalDispute.caseNumber) || text(legalDispute.title) || 'Gericht / Streit'
    const targetPath = `/legal-disputes/${legalDispute.id}`
    const events = []
    deadlines.filter((deadline) => validDate(deadline.date)).forEach((deadline) => events.push(systemEvent(
      calendar,
      `legal-dispute:${legalDispute.id}:deadline:${deadline.id}`,
      `${title} · ${deadline.type === 'appointment' ? 'Termin' : 'Frist'}${text(deadline.note) ? ` · ${text(deadline.note)}` : ''}`,
      deadline.date,
      targetPath,
      deadlineDescription(text(legalDispute.title), deadline),
      { time: text(deadline.time), reminderEnabled: deadline.reminderEnabled, hasReminder: true },
    )))
    return events
  })
}

async function inkassoEvents(calendar) {
  const cases = await listInkassoCases()
  const dateFields = [
    ['originalDueDate', 'Fälligkeit'],
    ['lastReminderDate', 'Letzte Mahnung'],
    ['lawyerHandoverDate', 'Übergabe an Rechtsanwalt'],
    ['paymentOrderDate', 'Mahnbescheid'],
    ['enforcementOrderDate', 'Vollstreckungsbescheid'],
  ]
  const deadlineLists = await Promise.all(cases.map(async (inkassoCase) => ({
    inkassoCase,
    deadlines: await listInkassoCaseDeadlines(inkassoCase.id),
  })))
  const fieldEvents = cases.flatMap((inkassoCase) => dateFields
    .filter(([field]) => validDate(inkassoCase[field]))
    .map(([field, label]) => systemEvent(
      calendar,
      `inkasso:${inkassoCase.id}:${field}`,
      `${text(inkassoCase.caseNumber) || text(inkassoCase.debtorName) || 'Inkassofall'} · ${label}`,
      inkassoCase[field],
      `/inkasso/${inkassoCase.id}`,
      text(inkassoCase.title) || text(inkassoCase.debtorName),
    )))
  const deadlineEvents = deadlineLists.flatMap(({ inkassoCase, deadlines }) => deadlines
    .filter((deadline) => validDate(deadline.date))
    .map((deadline) => systemEvent(
      calendar,
      `inkasso:${inkassoCase.id}:deadline:${deadline.id}`,
      `${text(inkassoCase.caseNumber) || text(inkassoCase.debtorName) || 'Inkassofall'} · ${text(deadline.note) || 'Termin / Frist'}`,
      deadline.date,
      `/inkasso/${inkassoCase.id}`,
      deadlineDescription(text(inkassoCase.title) || text(inkassoCase.debtorName), deadline),
      { time: text(deadline.time), reminderEnabled: deadline.reminderEnabled, hasReminder: true },
    )))
  return [...fieldEvents, ...deadlineEvents]
}

export async function listSystemCalendarEvents(calendars) {
  const selected = new Map(calendars.map((calendar) => [calendar.id, calendar]))
  const eventLists = await Promise.all([
    selected.has('system-damages') ? damageEvents(selected.get('system-damages')) : [],
    selected.has('system-insolvencies') ? insolvencyEvents(selected.get('system-insolvencies')) : [],
    selected.has('system-legal-disputes') ? legalDisputeEvents(selected.get('system-legal-disputes')) : [],
    selected.has('system-inkasso') ? inkassoEvents(selected.get('system-inkasso')) : [],
  ])
  return eventLists.flat()
}
