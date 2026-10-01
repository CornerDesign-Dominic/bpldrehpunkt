import { defaultShipmentTrackingUiModel } from '../components/transport-orders/shipmentTrackingUiModel.js'

const fieldLabels = {
  licensePlate: 'Kennzeichen',
  tractorLicensePlate: 'Kennzeichen Zugmaschine',
  trailerLicensePlate: 'Kennzeichen Auflieger',
  driverName: 'Name vom LKW-Fahrer',
  driverPhone: 'Handynummer vom Fahrer',
  estimatedArrivalLoadingAt: 'Voraussichtliche Ankunft Ladestelle',
  actualArrivalLoadingAt: 'Tatsächliche Ankunft Ladestelle',
  loadingStartedAt: 'Beladung gestartet',
  loadingCompletedAt: 'Beladung fertig',
  estimatedDepartureLoadingAt: 'Voraussichtliche Abfahrt Ladestelle',
  actualDepartureLoadingAt: 'Tatsächliche Abfahrt Ladestelle',
  estimatedArrivalUnloadingAt: 'Voraussichtliche Ankunft Entladestelle',
  actualArrivalUnloadingAt: 'Tatsächliche Ankunft Entladestelle',
  unloadingStartedAt: 'Entladung gestartet',
  unloadingCompletedAt: 'Entladung fertig',
  proofStatus: 'Nachweisstatus',
}

const sourceLabels = { manual: 'Manuelle Eingabe', import: 'TA-Import', manual_mail: 'Manueller Mailversand', automatic: 'Sendungsverfolgungs-Automatik', ai_mail: 'KI · Status-Postfach', phone: 'Telefon', other_mailbox: 'Anderes E-Mail-Postfach', other: 'Sonstiges' }
const proofLabels = { unknown: 'unbekannt', open: 'offen', received: 'erhalten' }
const timeFormatter = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const berlinDateTimeFormatter = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const localPlanTimestamp = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/
const germanPlanTimestamp = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/
const timeOnlyTimestamp = /^(\d{1,2}):(\d{2})$/

export const shipmentTrackingStageConfigurations = Object.freeze({
  preparation: { label: 'Kennzeichen', title: 'Kennzeichen erfassen', fields: ['licensePlate', 'driverName', 'driverPhone'] },
  loading: { label: 'Ladestelle', title: 'Ladestelle erfassen', fields: ['estimatedArrivalLoadingAt', 'actualArrivalLoadingAt', 'loadingStartedAt', 'loadingCompletedAt', 'estimatedDepartureLoadingAt', 'actualDepartureLoadingAt'] },
  in_transit: { label: 'Unterwegs', title: 'Fahrtstatus aktualisieren', fields: [] },
  unloading: { label: 'Entladestelle', title: 'Entladestelle erfassen', fields: ['estimatedArrivalUnloadingAt', 'actualArrivalUnloadingAt', 'unloadingStartedAt', 'unloadingCompletedAt'] },
  afterTransport: { label: 'Nachtransport', title: 'Bewertungen', fields: [] },
})

const transitEventTypes = new Set(['transit_position_reported', 'transit_pause_reported'])
function transitEntry(event) { return event?.newValue?.transitEntry || null }
function transitEvents(events, kind) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => transitEntry(event)?.kind === kind && transitEventTypes.has(event.eventType))
    .sort((left, right) => eventDateValue(right.eventTime) - eventDateValue(left.eventTime))
}
export function formatTransitDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 1) return '—'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return [hours && `${hours} Std.`, remainder && `${remainder} Min.`].filter(Boolean).join(' ')
}

export const shipmentTrackingStationStateDefinitions = Object.freeze({
  pending: { label: 'Noch nicht erreicht' },
  active: { label: 'Aktuell offen' },
  completed: { label: 'Erledigt' },
  automationActive: { label: 'Automatik läuft' },
  manualEscalation: { label: 'Manuelle Klärung erforderlich' },
})

function asDate(value) {
  if (value?.toDate) return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string' && value) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function hasValue(value) {
  return typeof value === 'string' ? Boolean(value.trim()) : Boolean(value)
}

function licensePlate(tracking) {
  if (hasValue(tracking?.licensePlate)) return tracking.licensePlate.trim()
  return [tracking?.tractorLicensePlate, tracking?.trailerLicensePlate]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .join(' / ')
}

function formatTime(value) {
  const date = asDate(value)
  return date ? timeFormatter.format(date) : null
}

function berlinParts(value) {
  if (typeof value === 'string') {
    const source = value.trim()
    const isoMatch = source.match(localPlanTimestamp)
    if (isoMatch) return calendarDateTimeParts(isoMatch[1], isoMatch[2], isoMatch[3], isoMatch[4], isoMatch[5])
    const germanMatch = source.match(germanPlanTimestamp)
    if (germanMatch) return calendarDateTimeParts(germanMatch[3], germanMatch[2], germanMatch[1], germanMatch[4], germanMatch[5])
  }
  const date = asDate(value)
  if (!date) return null
  const parts = Object.fromEntries(berlinDateTimeFormatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: parts.hour, minute: parts.minute, weekday: `${parts.weekday.replace(/\.$/, '')}.` }
}

function calendarDateTimeParts(yearValue, monthValue, dayValue, hourValue, minuteValue) {
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  const hour = Number(hourValue)
  const minute = Number(minuteValue)
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (!Number.isInteger(year) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return null
  return { year, month, day, hour: String(hour).padStart(2, '0'), minute: String(minute).padStart(2, '0'), weekday: weekdayForCalendarDate(year, month, day) }
}

function timeOnlyParts(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(timeOnlyTimestamp)
  return match ? calendarDateTimeParts(2000, 1, 1, match[1], match[2]) : null
}

function withTimeOnSameDay(dateParts, timeParts) {
  if (!dateParts || !timeParts) return null
  return { ...dateParts, hour: timeParts.hour, minute: timeParts.minute }
}

function weekdayForCalendarDate(year, month, day) {
  return ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

function compactSlotDateTime(parts) {
  return `${parts.weekday}, ${parts.hour}:${parts.minute}`
}

function expandedSlotDateTime(parts, includeYear) {
  const date = `${String(parts.day).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}.${includeYear ? parts.year : ''}`
  return `${parts.weekday}, ${date} · ${parts.hour}:${parts.minute}`
}

function calendarDayDistance(left, right) {
  return Math.abs(Math.round((Date.UTC(right.year, right.month - 1, right.day) - Date.UTC(left.year, left.month - 1, left.day)) / 86400000))
}

export function formatShipmentTrackingSlot(fromValue, untilValue) {
  const from = berlinParts(fromValue)
  const until = berlinParts(untilValue) || withTimeOnSameDay(from, timeOnlyParts(untilValue))
  if (!from && !until) return 'Sollzeit fehlt'
  if (from && !until) return hasValue(untilValue) ? `ab ${compactSlotDateTime(from)}` : `FIX\n${compactSlotDateTime(from)}`
  if (!from && until) return `bis ${compactSlotDateTime(until)}`
  const sameDay = from.year === until.year && from.month === until.month && from.day === until.day
  const sameTime = from.hour === until.hour && from.minute === until.minute
  if (sameDay && sameTime) return `FIX\n${compactSlotDateTime(from)}`
  if (sameDay) return `${compactSlotDateTime(from)}–${until.hour}:${until.minute}`
  if (from.year === until.year && calendarDayDistance(from, until) <= 7) return `${compactSlotDateTime(from)} – ${compactSlotDateTime(until)}`
  const includeYear = from.year !== until.year
  return `${expandedSlotDateTime(from, includeYear)} – ${expandedSlotDateTime(until, includeYear)}`
}

function scheduleWindow(from, until) {
  return { label: formatShipmentTrackingSlot(from, until), dueAt: asDate(until) || asDate(from) }
}

function routeDuration(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null
  const minutes = Math.round((distanceKm / 70) * 60)
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours ? `${hours} Std.` : ''}${hours && remainder ? ' ' : ''}${remainder ? `${remainder} Min.` : ''}` || '0 Min.'
}

export function formatShipmentTrackingRoutePlan(distanceKm) {
  const duration = routeDuration(distanceKm)
  return duration ? `${distanceKm} km\n${duration}` : 'Planstrecke noch nicht berechnet'
}

function actualRange(label, start, end, kind) {
  const from = formatTime(start)
  const until = formatTime(end)
  if (from && until) return [{ kind, label, value: from === until ? from : `${from}–${until}` }]
  if (from) return [{ kind, label: `${label} begonnen`, value: from }]
  if (until) return [{ kind, label: `${label} beendet`, value: until }]
  return []
}

export function formatShipmentTrackingDelay(minutes) {
  const rounded = Math.max(0, Math.round(minutes || 0))
  if (rounded < 60) return `+${rounded} Min. verspätet`
  const days = Math.floor(rounded / 1440)
  const hours = Math.floor((rounded % 1440) / 60)
  const remainingMinutes = rounded % 60
  const parts = []
  if (days) parts.push(`${days} ${days === 1 ? 'Tag' : 'Tage'}`)
  if (hours) parts.push(`${hours} Std.`)
  if (remainingMinutes) parts.push(`${remainingMinutes} Min.`)
  return `${days ? '' : '+'}${parts.join(' ')} verspätet`
}

export function shipmentTrackingScheduleStatus({ plannedFrom, plannedUntil, actualAt } = {}) {
  const dueAt = asDate(plannedUntil) || asDate(plannedFrom)
  const actual = asDate(actualAt)
  if (!actual) return dueAt ? { key: 'open', label: 'Noch offen' } : { key: 'not-assessable', label: 'Noch nicht beurteilbar' }
  if (!dueAt) return { key: 'not-assessable', label: 'Noch nicht beurteilbar' }
  const differenceMinutes = Math.round((actual.getTime() - dueAt.getTime()) / 60000)
  if (differenceMinutes <= 0) return { key: 'on-plan', label: 'Im Plan' }
  return { key: 'deviation', label: 'Abweichung', detail: formatShipmentTrackingDelay(differenceMinutes), differenceMinutes }
}

function berlinWallTime(value) {
  const parts = berlinParts(value)
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day, Number(parts.hour), Number(parts.minute)) : null
}

function formatElapsedMinutes(value) {
  const minutes = Math.max(0, Math.round(value))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours ? `${hours} Std.` : ''}${hours && remainder ? ' ' : ''}${remainder ? `${remainder} Min.` : ''}` || '0 Min.'
}

function assessment(severity, text) { return { severity, text } }

/**
 * Reine Darstellungsauswertung für fachliche Hinweise an einzelnen Ist-Werten.
 * Sie erzeugt weder Datenänderungen noch implizite Statuswerte.
 */
export function shipmentTrackingStationAssessments({ tracking, imported, customerPolicy, now = new Date() } = {}) {
  const loadingFrom = berlinWallTime(imported?.loading?.window?.from)
  const loadingUntil = berlinWallTime(imported?.loading?.window?.until)
  const arrival = berlinWallTime(tracking?.actualArrivalLoadingAt)
  const departure = berlinWallTime(tracking?.actualDepartureLoadingAt)
  const loadingStarted = berlinWallTime(tracking?.loadingStartedAt)
  const loadingCompleted = berlinWallTime(tracking?.loadingCompletedAt)
  const current = berlinWallTime(now)
  const result = { preparation: {}, loading: {} }

  if (!licensePlate(tracking) && customerPolicy?.customer?.licensePlateImportant === true) result.preparation.licensePlate = assessment('notice', 'Kennzeichen wichtig für Kunde')
  if (arrival === null && customerPolicy?.customer?.loadingSiteInformationImportant === true) {
    result.loading.arrival = assessment('notice', 'Ankunft wichtig für Kunde')
  } else if (arrival !== null && loadingFrom !== null && loadingUntil !== null) {
    if (arrival > loadingUntil) result.loading.arrival = assessment('alert', `${formatElapsedMinutes((arrival - loadingUntil) / 60000)} nach Slotende`)
    else if (arrival > loadingFrom) result.loading.arrival = assessment('notice', 'Spät im Slot')
  }
  if (loadingStarted !== null && current !== null) {
    const reference = loadingCompleted ?? current
    const duration = (reference - loadingStarted) / 60000
    if (duration > 180) result.loading.process = assessment('alert', `${loadingCompleted !== null ? 'Beladung dauerte' : 'Beladung seit'} ${formatElapsedMinutes(duration)}`)
    else if (duration > 90) result.loading.process = assessment('notice', `${loadingCompleted !== null ? 'Beladung dauerte' : 'Beladung seit'} ${formatElapsedMinutes(duration)}`)
  }
  if (departure !== null && loadingUntil !== null && departure > loadingUntil) {
    const duration = (departure - loadingUntil) / 60000
    result.loading.departure = assessment(duration > 60 ? 'alert' : 'notice', `${formatElapsedMinutes(duration)} nach Slotende`)
  }
  return result
}

function loadingWorkflowLabel(tracking, state) {
  if (state === 'completed') return 'Abfahrt erfolgt'
  if (tracking?.loadingStartedAt && !tracking?.loadingCompletedAt) return 'Beladung läuft'
  if (tracking?.actualArrivalLoadingAt) return 'Ankunft erfolgt'
  return 'Ankunft noch offen'
}

function transitWorkflowLabel(tracking, state, hasReport = false) {
  if (state === 'completed') return 'Ankunft erfolgt'
  if (state === 'active' && formatTime(tracking?.actualDepartureLoadingAt)) return `Unterwegs seit ${formatTime(tracking.actualDepartureLoadingAt)}`
  if (hasReport) return 'Fahrtmeldung vorhanden'
  return 'Noch nicht unterwegs'
}

function unloadingWorkflowLabel(tracking, state) {
  if (state === 'completed') return 'Entladung abgeschlossen'
  if (tracking?.unloadingStartedAt && !tracking?.unloadingCompletedAt) return 'Entladung läuft'
  if (tracking?.actualArrivalUnloadingAt) return 'Ankunft erfolgt'
  return 'Ankunft noch offen'
}

export function shipmentTrackingWorkflowStates(tracking) {
  const started = Boolean(tracking)
  const completed = [
    Boolean(licensePlate(tracking)),
    Boolean(tracking?.actualDepartureLoadingAt),
    Boolean(tracking?.actualArrivalUnloadingAt),
    Boolean(tracking?.unloadingStartedAt && tracking?.unloadingCompletedAt),
    tracking?.lifecycleStatus === 'completed',
  ]
  if (!started) return ['pending', 'pending', 'pending', 'pending', 'pending']
  if (tracking?.lifecyclePhase === 'upcoming') return ['pending', 'pending', 'pending', 'pending', 'pending']
  const firstOpen = completed.findIndex((value) => !value)
  return completed.map((isCompleted, index) => isCompleted ? 'completed' : index === firstOpen ? 'active' : 'pending')
}

export function shipmentTrackingStations({ tracking, imported, route, customerPolicy, now, events } = {}) {
  const loadingPlan = scheduleWindow(imported?.loading?.window?.from, imported?.loading?.window?.until)
  const unloadingPlan = scheduleWindow(imported?.unloading?.window?.from, imported?.unloading?.window?.until)
  const routePlan = formatShipmentTrackingRoutePlan(route?.roundedDistanceKm)
  const workflowStates = shipmentTrackingWorkflowStates(tracking)
  const assessments = shipmentTrackingStationAssessments({ tracking, imported, customerPolicy, now })
  const plate = licensePlate(tracking)
  const loadingActualRows = [
    formatTime(tracking?.actualArrivalLoadingAt) && { kind: 'arrival', label: 'Ankunft', value: formatTime(tracking.actualArrivalLoadingAt) },
    ...actualRange('Beladung', tracking?.loadingStartedAt, tracking?.loadingCompletedAt, 'process'),
    formatTime(tracking?.actualDepartureLoadingAt) && { kind: 'departure', label: 'Abfahrt', value: formatTime(tracking.actualDepartureLoadingAt) },
  ].filter(Boolean)
  const unloadingActualRows = [
    formatTime(tracking?.actualArrivalUnloadingAt) && { kind: 'arrival', label: 'Ankunft', value: formatTime(tracking.actualArrivalUnloadingAt) },
    ...actualRange('Entladung', tracking?.unloadingStartedAt, tracking?.unloadingCompletedAt, 'process'),
  ].filter(Boolean)
  const loadingForecastRows = [
    formatTime(tracking?.estimatedArrivalLoadingAt) && { label: 'Voraussichtliche Ankunft', value: formatTime(tracking.estimatedArrivalLoadingAt) },
    formatTime(tracking?.estimatedDepartureLoadingAt) && { label: 'Voraussichtliche Abfahrt', value: formatTime(tracking.estimatedDepartureLoadingAt) },
  ].filter(Boolean)
  const unloadingForecastRows = [
    formatTime(tracking?.estimatedArrivalUnloadingAt) && { label: 'Voraussichtliche Ankunft', value: formatTime(tracking.estimatedArrivalUnloadingAt) },
  ].filter(Boolean)
  const latestPosition = transitEntry(transitEvents(events, 'position')[0])
  const latestPause = transitEntry(transitEvents(events, 'pause')[0])
  const transitRows = [
    latestPosition && { kind: 'position', label: latestPosition.location || 'Letzter Standort', value: `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(latestPosition.kilometersToDestination)} km bis Ziel · ${formatShipmentTrackingTimestamp(latestPosition.at)}` },
    latestPause && { kind: 'pause', label: 'Letzte Pause', value: `${formatShipmentTrackingTimestamp(latestPause.at)} · ${formatTransitDuration(latestPause.durationMinutes)}` },
  ].filter(Boolean)

  return [
    {
      id: 'preparation',
      label: 'Vorbereitung',
      workflowState: workflowStates[0],
      workflowLabel: plate ? 'Kennzeichen vorhanden' : 'Kennzeichen noch offen',
      plan: null,
      actualRows: plate ? [{ kind: 'license-plate', label: 'Kennzeichen', value: plate }] : [],
      forecastRows: [],
      status: null,
      assessments: assessments.preparation,
      emptyMessage: plate ? null : 'Kennzeichen noch offen',
    },
    {
      id: 'loading',
      label: 'Ladestelle',
      workflowState: workflowStates[1],
      workflowLabel: loadingWorkflowLabel(tracking, workflowStates[1]),
      plan: loadingPlan?.label || 'Sollzeit nicht vorhanden',
      actualRows: loadingActualRows,
      forecastRows: loadingForecastRows,
      status: shipmentTrackingScheduleStatus({ plannedFrom: imported?.loading?.window?.from, plannedUntil: imported?.loading?.window?.until, actualAt: tracking?.actualArrivalLoadingAt }),
      assessments: assessments.loading,
      emptyMessage: loadingActualRows.length || loadingForecastRows.length ? null : 'Noch keine Angaben zur Ladestelle',
    },
    {
      id: 'in_transit',
      label: 'Unterwegs',
      workflowState: workflowStates[2],
      workflowLabel: transitWorkflowLabel(tracking, workflowStates[2], transitRows.length > 0),
      plan: routePlan,
      actualRows: [...transitRows, ...(formatTime(tracking?.actualDepartureLoadingAt) ? [{ kind: 'departure', label: 'Unterwegs seit', value: formatTime(tracking.actualDepartureLoadingAt) }] : [])],
      forecastRows: formatTime(tracking?.estimatedArrivalUnloadingAt) ? [{ label: 'Prognose Ankunft', value: formatTime(tracking.estimatedArrivalUnloadingAt) }] : [],
      status: null,
      assessments: {},
      emptyMessage: null,
    },
    {
      id: 'unloading',
      label: 'Entladestelle',
      workflowState: workflowStates[3],
      workflowLabel: unloadingWorkflowLabel(tracking, workflowStates[3]),
      plan: unloadingPlan?.label || 'Sollzeit nicht vorhanden',
      actualRows: unloadingActualRows,
      forecastRows: unloadingForecastRows,
      status: shipmentTrackingScheduleStatus({ plannedFrom: imported?.unloading?.window?.from, plannedUntil: imported?.unloading?.window?.until, actualAt: tracking?.actualArrivalUnloadingAt }),
      assessments: {},
      emptyMessage: unloadingActualRows.length || unloadingForecastRows.length ? null : 'Noch keine Angaben zur Entladestelle',
    },
    {
      id: 'afterTransport',
      label: 'Nachtransport',
      workflowState: workflowStates[4],
      workflowLabel: tracking?.lifecycleStatus === 'completed' ? 'Sendungsverfolgung abgeschlossen' : 'Abschluss ausstehend',
      plan: null,
      actualRows: [],
      forecastRows: [],
      status: null,
      assessments: {},
      emptyMessage: null,
    },
  ]
}

function summaryRow(label, value, kind = 'actual', key = null, hint = null) {
  return { label, value, kind, ...(key ? { key } : {}), ...(hint ? { hint } : {}) }
}

function aiSourceFields(stationId, row, tracking) {
  if (stationId === 'preparation') return tracking?.licensePlate ? ['licensePlate'] : ['tractorLicensePlate', 'trailerLicensePlate']
  if (stationId === 'loading') {
    if (row.kind === 'forecast') return row.label === 'Voraussichtliche Abfahrt' ? ['estimatedDepartureLoadingAt'] : ['estimatedArrivalLoadingAt']
    if (row.label === 'Ankunft') return ['actualArrivalLoadingAt']
    if (row.label === 'Abfahrt') return ['actualDepartureLoadingAt']
    if (row.label === 'Beladung begonnen') return ['loadingStartedAt']
    if (row.label === 'Beladung beendet') return ['loadingCompletedAt']
    return ['loadingStartedAt', 'loadingCompletedAt']
  }
  if (stationId === 'in_transit') return row.kind === 'position' || row.kind === 'pause' ? [] : row.kind === 'forecast' ? ['estimatedArrivalUnloadingAt'] : ['actualDepartureLoadingAt']
  if (stationId === 'unloading') {
    if (row.kind === 'forecast') return ['estimatedArrivalUnloadingAt']
    if (row.label === 'Ankunft') return ['actualArrivalUnloadingAt']
    if (row.label === 'Entladung begonnen') return ['unloadingStartedAt']
    if (row.label === 'Entladung beendet') return ['unloadingCompletedAt']
    return ['unloadingStartedAt', 'unloadingCompletedAt']
  }
  return []
}

function markAiSources(rows, stationId, tracking) {
  return rows.map((row) => row.kind !== 'missing' && aiSourceFields(stationId, row, tracking).some((field) => tracking?.fieldSources?.[field]?.source === 'ai_mail') ? { ...row, ai: true } : row)
}

function stageActionLabel(stageId, tracking) {
  const config = shipmentTrackingStageConfigurations[stageId]
  if (!config) return 'Angaben erfassen'
  const hasStageValue = config.fields.some((field) => hasValue(tracking?.[field]) && tracking?.[field] !== 'unknown')
  if (stageId === 'preparation') return licensePlate(tracking) ? 'Kennzeichen aktualisieren' : 'Kennzeichen erfassen'
  if (stageId === 'loading') return hasStageValue ? 'Ladestelle aktualisieren' : 'Ladestelle erfassen'
  if (stageId === 'unloading') return hasStageValue ? 'Entladestelle aktualisieren' : 'Entladestelle erfassen'
  if (stageId === 'afterTransport') return 'Bewertungen'
  return config.title
}

export function shipmentTrackingStationSummary(station, tracking) {
  const actual = station.actualRows || []
  const forecast = station.forecastRows || []
  let rows = []
  if (station.id === 'preparation') {
    const plate = licensePlate(tracking)
    rows = plate ? [summaryRow('', plate)] : [summaryRow('', 'Kennzeichen offen', 'missing', 'licensePlate', station.assessments?.licensePlate)]
  } else if (station.id === 'loading') {
    const rowKeys = { arrival: 'arrival', process: 'process', departure: 'departure' }
    rows = [...actual.map((row) => summaryRow(row.label, row.value, 'actual', rowKeys[row.kind], station.assessments?.[rowKeys[row.kind]])), ...forecast.map((row) => summaryRow(row.label, row.value, 'forecast'))]
    if (!rows.length) rows = [summaryRow('', 'Ankunft offen', 'missing', 'arrival', station.assessments?.arrival)]
  } else if (station.id === 'in_transit') {
    rows = [...actual.map((row) => summaryRow(row.label, row.value, row.kind === 'position' || row.kind === 'pause' ? row.kind : 'actual')), ...forecast.map((row) => summaryRow(row.label, row.value, 'forecast'))]
    if (!rows.length) rows = [summaryRow('', 'Noch nicht unterwegs', 'missing')]
  } else if (station.id === 'unloading') {
    rows = [...actual.map((row) => summaryRow(row.label, row.value)), ...forecast.map((row) => summaryRow(row.label, row.value, 'forecast'))]
    if (!rows.length) rows = [summaryRow('', 'Ankunft offen', 'missing')]
  }
  return { rows: markAiSources(rows.slice(0, 3), station.id, tracking), actionLabel: stageActionLabel(station.id, tracking) }
}

function eventDateValue(value) {
  const date = asDate(value)
  return date ? date.getTime() : 0
}

export function shipmentTrackingStageEvents(events, stageId) {
  const fields = shipmentTrackingStageConfigurations[stageId]?.fields || []
  return (Array.isArray(events) ? events : [])
    .filter((event) => (event.eventType === 'tracking_completed' && stageId === 'afterTransport') || (stageId === 'in_transit' && transitEventTypes.has(event.eventType)) || (event.changedFields || []).some((field) => fields.includes(field)))
    .sort((left, right) => eventDateValue(left.recordedAt) - eventDateValue(right.recordedAt))
}

export function shipmentTrackingStageEventDetails(event, stageId) {
  if (stageId === 'in_transit' && transitEventTypes.has(event.eventType)) {
    const entry = transitEntry(event)
    if (!entry) return []
    return entry.kind === 'position'
      ? [{ label: 'Standortmeldung', value: `${entry.location ? `${entry.location} · ` : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(entry.kilometersToDestination)} km bis Entladestelle` }]
      : [{ label: 'Pause', value: formatTransitDuration(entry.durationMinutes) }]
  }
  const fields = shipmentTrackingStageConfigurations[stageId]?.fields || []
  return (event.changedFields || []).filter((field) => fields.includes(field)).map((field) => ({
    label: fieldLabels[field] || field,
    value: historyValue(field, event.newValue?.[field]),
  }))
}

export function formatShipmentTrackingTimestamp(value, options = { dateStyle: 'short', timeStyle: 'short' }) {
  const date = asDate(value)
  return date ? new Intl.DateTimeFormat('de-DE', options).format(date) : '—'
}

export function timestampToDateTimeInput(value) {
  const date = asDate(value)
  if (!date) return ''
  const part = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`
}

export function shipmentTrackingFormValues(tracking) {
  return Object.fromEntries(Object.keys(fieldLabels).map((field) => [field, field === 'licensePlate' ? licensePlate(tracking) : field.endsWith('At') ? timestampToDateTimeInput(tracking?.[field]) : tracking?.[field] ?? (field === 'proofStatus' ? 'unknown' : '')]))
}

export function shipmentTrackingTimelineModel(tracking, imported, route, customerPolicy, events) {
  const stations = shipmentTrackingStations({ tracking, imported, route, customerPolicy, events })
  if (!tracking) return { ...defaultShipmentTrackingUiModel, trackingExists: false, stations }
  const completed = tracking.lifecycleStatus === 'completed'
  const lifecyclePhase = completed ? 'completed' : tracking.lifecyclePhase === 'upcoming' ? 'upcoming' : 'in_progress'
  const lifecycleLabels = { upcoming: 'Bevorstehend', in_progress: 'Laufend', completed: 'Durchgeführt' }
  return {
    ...defaultShipmentTrackingUiModel,
    status: completed ? 'confirmed' : 'manual',
    statusLabel: completed ? 'Sendungsverfolgung abgeschlossen' : 'Manuelles Tracking aktiv',
    lifecycleStatus: completed ? 'completed' : 'active',
    lifecycleLabel: lifecycleLabels[lifecyclePhase] || 'Laufend',
    trackingTypeLabel: tracking.trackingMode === 'automatic' ? 'Automatisch' : tracking.trackingStartedEarly === true ? 'Vorzeitig gestartet' : 'Manuell',
    trackingExists: true,
    vehiclePosition: { stageId: tracking.stageId || 'preparation', progressToNextStage: tracking.progressToNextStage || 0 },
    stations,
  }
}

function historyValue(field, value) {
  if (value === null || value === undefined || value === '') return 'geleert'
  if (field.endsWith('At')) return formatShipmentTrackingTimestamp(value, { hour: '2-digit', minute: '2-digit' })
  if (field === 'proofStatus') return proofLabels[value] || value
  return value
}

function eventValueAtPath(value, path) {
  return path.split('.').reduce((current, segment) => current && typeof current === 'object' ? current[segment] : undefined, value)
}

function hasEventValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function importHistoryValue(value) {
  if (!hasEventValue(value)) return 'Nicht hinterlegt'
  return typeof value === 'number' ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value) : String(value)
}

export function shipmentTrackingEventChangeType(event) {
  if (transitEventTypes.has(event.eventType)) return 'Neu'
  if (event.eventType === 'tracking_started') return 'Neu'
  if (event.eventType === 'tracking_completed') return 'Abgeschlossen'
  if (event.eventType === 'tracking_manual_mail_sent' || event.eventType === 'tracking_automatic_mail_sent' || event.eventType === 'tracking_actual_arrival_confirmation_sent') return 'Versendet'
  if (event.eventType === 'transport_order_import_updated') {
    if (!hasEventValue(event.newValue)) return 'Gelöscht'
    if (!hasEventValue(event.oldValue)) return 'Neu'
    return 'Aktualisiert'
  }
  const fields = Array.isArray(event.changedFields) ? event.changedFields : []
  if (!fields.length) return 'Aktualisiert'
  const changes = fields.map((field) => ({ oldValue: eventValueAtPath(event.oldValue, field), newValue: eventValueAtPath(event.newValue, field) }))
  if (changes.every((change) => !hasEventValue(change.newValue))) return 'Gelöscht'
  if (changes.every((change) => !hasEventValue(change.oldValue) && hasEventValue(change.newValue))) return 'Neu'
  return 'Aktualisiert'
}

export function shipmentTrackingEventDescription(event) {
  if (event.eventType === 'transit_position_reported') {
    const entry = transitEntry(event)
    return entry ? `Standortmeldung: ${entry.location ? `${entry.location} · ` : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(entry.kilometersToDestination)} km bis Entladestelle` : 'Standortmeldung'
  }
  if (event.eventType === 'transit_pause_reported') return `Pause erfasst: ${formatTransitDuration(transitEntry(event)?.durationMinutes)}`
  if (event.eventType === 'tracking_started') return 'Sendungsverfolgung gestartet'
  if (event.eventType === 'tracking_completed') return 'Sendungsverfolgung abgeschlossen'
  if (event.eventType === 'tracking_automation_paused') return 'Sendungsverfolgungs-Automatik pausiert'
  if (event.eventType === 'tracking_automation_resumed') return 'Sendungsverfolgungs-Automatik fortgeführt'
  if (event.eventType === 'transport_order_import_updated') return `${event.fieldLabel || event.field || 'Auftragsdaten'}: ${importHistoryValue(event.oldValue)} → ${importHistoryValue(event.newValue)}`
  if (event.eventType === 'tracking_phase_changed') {
    const labels = { upcoming: 'Bevorstehend', preparation: 'Laufend', in_progress: 'Laufend', aftercare: 'Laufend', completed: 'Durchgeführt' }
    return `Tracking-Status: ${labels[event.newValue?.lifecyclePhase] || 'aktualisiert'}`
  }
  if (event.eventType === 'tracking_recipients_updated') {
    const labels = { customer: 'Kunde', carrier: 'Unternehmer' }
    return (event.changedFields || []).map((field) => {
      const role = field.replace('recipients.', '')
      const previous = event.oldValue?.recipients?.[role]?.email || 'Nicht hinterlegt'
      const next = event.newValue?.recipients?.[role]?.email || 'Nicht hinterlegt'
      return `Empfänger ${labels[role] || role}: ${previous} → ${next}`
    }).join(' · ') || 'Tracking-Empfänger aktualisiert'
  }
  if (event.eventType === 'tracking_manual_mail_sent') {
    const topics = Array.isArray(event.newValue?.delivery?.topics) ? event.newValue.delivery.topics : []
    const labels = { licensePlate: 'Kennzeichen', loadingSite: 'LKW-Ankunft' }
    const recipient = event.newValue?.delivery?.recipient || 'Unternehmer'
    const subject = topics.map((topic) => labels[topic] || topic).join(' und ') || 'Tracking-Anfrage'
    return `${subject} manuell an ${recipient} gesendet`
  }
  if (event.eventType === 'tracking_automatic_mail_sent') {
    const topics = Array.isArray(event.newValue?.delivery?.topics) ? event.newValue.delivery.topics : []
    const labels = { licensePlate: 'Kennzeichen', loadingSite: 'LKW-Ankunft' }
    return `${topics.map((topic) => labels[topic] || topic).join(' und ') || 'Tracking-Anfrage'} automatisch versendet`
  }
  if (event.eventType === 'tracking_actual_arrival_confirmation_sent') return 'Aktuellen Stand kurz vor Ladung automatisch angefragt'
  const fields = Array.isArray(event.changedFields) ? event.changedFields : []
  if (!fields.length) return 'Tracking aktualisiert'
  return fields.map((field) => `${fieldLabels[field] || field} erfasst: ${historyValue(field, event.newValue?.[field])}`).join(' · ')
}

export { fieldLabels, sourceLabels, proofLabels }
