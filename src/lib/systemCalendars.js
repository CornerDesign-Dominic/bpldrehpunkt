import { listDamageCaseDeadlines, listDamageCases } from './damages.js'
import { listInsolvencies } from './insolvencies.js'
import { listLegalDisputes } from './legalDisputes.js'
import { listInkassoCases } from './inkasso.js'
import { canView } from './permissions.js'

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

function systemEvent(calendar, id, title, date, targetPath, description = '') {
  return {
    id,
    calendarId: calendar.id,
    calendarName: calendar.name,
    calendarColor: calendar.color,
    title,
    description,
    startDate: date,
    endDate: date,
    allDay: true,
    startTime: '',
    endTime: '',
    systemCalendar: true,
    targetPath,
  }
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
      text(damageCase.title),
    )))
}

async function insolvencyEvents(calendar) {
  const insolvencies = await listInsolvencies()
  return insolvencies
    .filter((insolvency) => validDate(insolvency.insolvencyDate))
    .map((insolvency) => systemEvent(
      calendar,
      `insolvency:${insolvency.id}:insolvency-date`,
      `${text(insolvency.partnerName) || 'Insolvenzfall'} · Insolvenzeröffnung`,
      insolvency.insolvencyDate,
      `/insolvenzen/${insolvency.id}`,
      text(insolvency.courtReference),
    ))
}

async function legalDisputeEvents(calendar) {
  const legalDisputes = await listLegalDisputes()
  return legalDisputes.flatMap((legalDispute) => {
    const title = text(legalDispute.caseNumber) || text(legalDispute.title) || 'Gericht / Streit'
    const targetPath = `/legal-disputes/${legalDispute.id}`
    const events = []
    if (validDate(legalDispute.nextDeadline)) events.push(systemEvent(
      calendar,
      `legal-dispute:${legalDispute.id}:deadline`,
      `${title} · ${text(legalDispute.nextDeadlineLabel) || 'Frist'}`,
      legalDispute.nextDeadline,
      targetPath,
      text(legalDispute.title),
    ))
    if (validDate(legalDispute.nextHearing)) events.push(systemEvent(
      calendar,
      `legal-dispute:${legalDispute.id}:hearing`,
      `${title} · Termin`,
      legalDispute.nextHearing,
      targetPath,
      text(legalDispute.title),
    ))
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
  return cases.flatMap((inkassoCase) => dateFields
    .filter(([field]) => validDate(inkassoCase[field]))
    .map(([field, label]) => systemEvent(
      calendar,
      `inkasso:${inkassoCase.id}:${field}`,
      `${text(inkassoCase.caseNumber) || text(inkassoCase.debtorName) || 'Inkassofall'} · ${label}`,
      inkassoCase[field],
      `/inkasso/${inkassoCase.id}`,
      text(inkassoCase.title) || text(inkassoCase.debtorName),
    )))
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
