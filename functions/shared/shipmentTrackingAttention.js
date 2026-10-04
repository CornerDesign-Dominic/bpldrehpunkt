import { DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, normalizeShipmentTrackingForecastSettings } from './shipmentTrackingForecastSettings.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, subtractWorkingMinutes } from './shipmentTrackingOperatingHours.js'
import { shipmentTrackingDate } from './shipmentTrackingTime.js'

function plate(tracking) { return [tracking?.licensePlate, tracking?.tractorLicensePlate, tracking?.trailerLicensePlate].some((value) => typeof value === 'string' && value.trim()) }
function berlinKey(value) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value).replace(' ', 'T') }
function localReference(value) { const key = berlinKey(value); return { date: key.slice(0, 10), time: key.slice(11, 16) } }
function workingHoursReached(now, deadline, hours, operatingHours) {
  if (!deadline) return false
  const threshold = subtractWorkingMinutes(operatingHours, localReference(deadline), hours * 60).local
  return berlinKey(now) >= `${threshold.date}T${threshold.time}`
}
function issue(id, severity, label, detail) { return { id, severity, label, detail } }
const rank = { critical: 0, warning: 1, info: 2, success: 3 }

export function shipmentTrackingAttention({ tracking = null, imported = {}, receivedMails = [], settings: value, operatingHours = DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, now = new Date() } = {}) {
  if (!tracking) return { items: [], visible: [], moreCount: 0 }
  const settings = normalizeShipmentTrackingForecastSettings(value || DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS)
  const timing = settings.timing
  const items = []
  const loadingFrom = shipmentTrackingDate(imported?.loading?.window?.from)
  const unloadingUntil = shipmentTrackingDate(imported?.unloading?.window?.until) || shipmentTrackingDate(imported?.unloading?.window?.from)
  const actualArrivalLoading = shipmentTrackingDate(tracking.actualArrivalLoadingAt)
  const loadingStarted = shipmentTrackingDate(tracking.loadingStartedAt)
  const loadingCompleted = shipmentTrackingDate(tracking.loadingCompletedAt)
  const estimatedArrivalLoading = shipmentTrackingDate(tracking.estimatedArrivalLoadingAt)
  const estimatedDeparture = shipmentTrackingDate(tracking.estimatedDepartureLoadingAt)
  const actualDeparture = shipmentTrackingDate(tracking.actualDepartureLoadingAt)
  const actualUnloading = shipmentTrackingDate(tracking.actualArrivalUnloadingAt)
  const manuallyReviewableMail = (receivedMails || []).some((mail) => mail?.ai?.reviewRequired === true || ['needs_review', 'error'].includes(mail?.ai?.status))
  if (manuallyReviewableMail) items.push(issue('mail-review', 'warning', 'Eingangsmail manuell prüfen', 'Eine zugeordnete Mail benötigt eine fachliche Prüfung.'))
  if (actualUnloading) {
    if (!loadingStarted || !loadingCompleted) {
      const missing = !loadingStarted && !loadingCompleted ? 'Beladezeiten' : !loadingStarted ? 'Beladestart' : 'Beladeende'
      const loading = issue('loading-wait', 'warning', `${missing} ergänzen`, 'Die Entladung ist abgeschlossen. Fehlende Beladezeiten können weiterhin nachgetragen werden.')
      loading.icon = 'stopwatch'
      items.push(loading)
    }
    items.sort((left, right) => rank[left.severity] - rank[right.severity] || left.label.localeCompare(right.label, 'de-DE'))
    return { items, visible: items.slice(0, 3), moreCount: Math.max(0, items.length - 3) }
  }
  if (tracking.automationPaused === true) items.push(issue('automation-paused', 'critical', 'Automatik pausiert', 'Fällige Anfragen werden während der Pause nicht ausgeführt.'))
  if (tracking.lifecyclePhase === 'in_progress' && !plate(tracking)) items.push(issue('license-plate', 'warning', 'KZ fehlt', 'Für die laufende Vorbereitung fehlt ein Kennzeichen.'))
  let truck = null
  if (actualDeparture && (!loadingStarted || !loadingCompleted)) {
    const missing = !loadingStarted && !loadingCompleted ? 'Beladezeiten' : !loadingStarted ? 'Beladestart' : 'Beladeende'
    truck = issue('loading-wait', 'warning', `${missing} ergänzen`, 'Die tatsächliche Abfahrt liegt vor. Die Beladezeit bleibt als gelber Hinweis offen, bis Start und Ende nachgetragen sind.')
    truck.icon = 'stopwatch'
  } else if (!actualArrivalLoading) {
    if (!estimatedArrivalLoading) {
      if (workingHoursReached(now, loadingFrom, timing.noArrivalRedWorkingHours, operatingHours)) truck = issue('loading-arrival', 'critical', 'Ladeankunft fehlt', 'Die rote Frist vor Ladebeginn ist erreicht.')
      else if (workingHoursReached(now, loadingFrom, timing.noArrivalYellowWorkingHours, operatingHours)) truck = issue('loading-arrival', 'warning', 'Ladeankunft fehlt', 'Eine Rückmeldung zur Ladeankunft wird benötigt.')
      else truck = issue('tracking-started', 'info', 'Sendungsverfolgung läuft', 'Vorbereitung läuft.')
    } else if (workingHoursReached(now, loadingFrom, timing.estimatedArrivalRedWorkingHours, operatingHours)) truck = issue('loading-arrival', 'critical', 'Ladeankunft bestätigen', 'Die tatsächliche Ankunft fehlt innerhalb der roten Frist.')
    else if (workingHoursReached(now, loadingFrom, timing.estimatedArrivalYellowWorkingHours, operatingHours)) truck = issue('loading-arrival', 'warning', 'Ladeankunft bestätigen', 'Die gemeldete Ankunft muss bestätigt werden.')
    else truck = issue('loading-arrival', 'success', 'Ladeankunft angekündigt', 'Eine voraussichtliche Ankunft liegt vor.')
  } else if (!loadingCompleted) {
    const anchor = loadingStarted || actualArrivalLoading
    const elapsedHours = (now.getTime() - anchor.getTime()) / 3600000
    const phase = loadingStarted ? 'Beladung' : 'Beladestart'
    const yellowAfter = loadingStarted ? timing.loadingEndYellowElapsedHours : timing.loadingStartYellowElapsedHours
    const redAfter = loadingStarted ? timing.loadingEndRedElapsedHours : timing.loadingStartRedElapsedHours
    truck = elapsedHours >= redAfter ? issue('loading-wait', 'critical', `${phase} überfällig`, 'Die Stopuhr zeigt eine überschrittene Frist.') : elapsedHours >= yellowAfter ? issue('loading-wait', 'warning', `${phase} beobachten`, 'Die Stopuhr läuft bereits länger als vorgesehen.') : issue('loading-wait', 'success', loadingStarted ? 'Beladung läuft' : 'LKW an Ladestelle', 'Stopuhr überwacht die Beladung.')
    truck.icon = 'stopwatch'
  } else if (!actualDeparture) {
    if (!estimatedDeparture) {
      const elapsedHours = (now.getTime() - loadingCompleted.getTime()) / 3600000
      truck = elapsedHours >= timing.departureMissingRedElapsedHours ? issue('departure-missing', 'critical', 'Abfahrt fehlt', 'Nach Beladeende fehlt weiterhin eine Abfahrt.') : issue('departure-missing', 'warning', 'Abfahrt fehlt', 'Nach Beladeende wird eine Abfahrt benötigt.')
    } else {
      const elapsedHours = (now.getTime() - estimatedDeparture.getTime()) / 3600000
      truck = elapsedHours >= timing.estimatedDepartureRedElapsedHours ? issue('departure-confirmation', 'critical', 'Abfahrt bestätigen', 'Die bestätigte Abfahrt ist überfällig.') : elapsedHours >= 0 ? issue('departure-confirmation', 'warning', 'Abfahrt bestätigen', 'Die erwartete Abfahrt ist erreicht.') : issue('departure-confirmation', 'success', 'Abfahrt angekündigt', 'Eine voraussichtliche Abfahrt liegt vor.')
    }
  } else if (!actualUnloading) {
    const hoursToDeadline = unloadingUntil ? (unloadingUntil.getTime() - now.getTime()) / 3600000 : null
    truck = hoursToDeadline !== null && hoursToDeadline <= 0 ? issue('unloading-arrival', 'critical', 'Entladeankunft fehlt', 'Das Entladefenster ist beendet.') : hoursToDeadline !== null && hoursToDeadline <= timing.unloadingYellowElapsedHoursBeforeDeadline ? issue('unloading-arrival', 'warning', 'Entladeankunft beobachten', 'Das Ende des Entladefensters naht.') : issue('in-transit', 'success', 'Unterwegs im Plan', 'Die tatsächliche Abfahrt liegt vor.')
  }
  if (truck && !(tracking.automationPaused === true && truck.severity !== 'critical')) items.push(truck)
  items.sort((left, right) => rank[left.severity] - rank[right.severity] || left.label.localeCompare(right.label, 'de-DE'))
  return { items, visible: items.slice(0, 3), moreCount: Math.max(0, items.length - 3) }
}
