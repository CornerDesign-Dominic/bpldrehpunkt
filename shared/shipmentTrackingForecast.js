import { DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, normalizeShipmentTrackingForecastSettings } from './shipmentTrackingForecastSettings.js'
import { shipmentTrackingDate } from './shipmentTrackingTime.js'

const MILLIS_PER_HOUR = 60 * 60 * 1000
const MINUTES_PER_HOUR = 60
const MAX_CONTINUOUS_DRIVING_MINUTES = 4.5 * MINUTES_PER_HOUR
const MANDATORY_BREAK_MINUTES = 45
const MAX_DAILY_DRIVING_MINUTES = 9 * MINUTES_PER_HOUR
const DAILY_REST_MINUTES = 11 * MINUTES_PER_HOUR
const REDUCED_WEEKLY_REST_MINUTES = 24 * MINUTES_PER_HOUR
const REGULAR_WEEKLY_REST_MINUTES = 45 * MINUTES_PER_HOUR
const berlinWeekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' })

function normalizedText(value) {
  return typeof value === 'string' ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de-DE').replace(/[^a-z0-9]+/g, ' ').trim() : ''
}

export function vehicleForecastProfile(vehicleType, settings = DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS) {
  const profiles = normalizeShipmentTrackingForecastSettings(settings).vehicleProfiles
  const source = normalizedText(vehicleType)
  const matches = profiles.filter((profile) => profile.aliases.some((alias) => source.includes(normalizedText(alias))))
  const profile = matches.length === 1 ? matches[0] : profiles.find((entry) => entry.id === 'standard') || profiles[0]
  return { ...profile, assumed: matches.length !== 1 }
}

function routeDistance(route) {
  const value = Number(route?.distanceKm ?? route?.roundedDistanceKm ?? route?.distance)
  return Number.isFinite(value) && value > 0 ? value : null
}

function activeTransitContext(events, actualDeparture, now) {
  if (!actualDeparture || !Array.isArray(events)) return { distanceKm: null, positionAt: null, pauseMinutes: 0 }
  const afterDeparture = events.filter((event) => {
    if (event?.removedAt || !['transit_position_reported', 'transit_pause_reported'].includes(event?.eventType)) return false
    const at = shipmentTrackingDate(event?.newValue?.transitEntry?.at || event?.eventTime)
    return at && at.getTime() >= actualDeparture.getTime()
  })
  const positions = afterDeparture.filter((event) => event.eventType === 'transit_position_reported').map((event) => ({ event, at: shipmentTrackingDate(event?.newValue?.transitEntry?.at || event?.eventTime), distanceKm: Number(event?.newValue?.transitEntry?.kilometersToDestination) })).filter((item) => item.at && Number.isFinite(item.distanceKm) && item.distanceKm >= 0).sort((left, right) => right.at.getTime() - left.at.getTime())
  const latestPosition = positions[0]
  const positionIsFresh = latestPosition && now.getTime() - latestPosition.at.getTime() >= 0 && now.getTime() - latestPosition.at.getTime() <= 60 * 60 * 1000
  const pauses = afterDeparture.filter((event) => event.eventType === 'transit_pause_reported').map((event) => ({ at: shipmentTrackingDate(event?.newValue?.transitEntry?.at || event?.eventTime), durationMinutes: Number(event?.newValue?.transitEntry?.durationMinutes) })).filter((item) => item.at && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0)
  const pauseMinutes = pauses.reduce((remaining, pause) => Math.max(remaining, Math.min(pause.durationMinutes, Math.max(0, (pause.at.getTime() + pause.durationMinutes * 60000 - now.getTime()) / 60000))), 0)
  return { distanceKm: positionIsFresh ? latestPosition.distanceKm : null, positionAt: positionIsFresh ? latestPosition.at : null, pauseMinutes }
}

function forecastColor(onTimeSharePercent, settings) {
  if (onTimeSharePercent <= settings.redThresholdPercent) return 'red'
  if (onTimeSharePercent < settings.greenThresholdPercent) return 'yellow'
  return 'green'
}

function serializableDate(value) { return value ? value.toISOString() : null }

function isSunday(value) { return berlinWeekdayFormatter.format(value) === 'Sun' }

/**
 * This is a cautious planning model, not a tachograph compliance check. It
 * starts a fresh driving day at the forecast basis because prior driving and
 * rest data are not available in a transport order. The operational Sunday
 * assumption intentionally plans a weekly rest at the first possible stop on
 * a Sunday when the trip reaches one.
 */
function regulatedArrival({ startAt, drivingMinutes, activePauseMinutes = 0, weeklyRestMinutes }) {
  let current = new Date(startAt.getTime() + activePauseMinutes * 60000)
  let remaining = drivingMinutes
  let continuousDriving = 0
  let dailyDriving = 0
  let breakCount = 0
  let dailyRestCount = 0
  let weeklyRestCount = 0
  let weeklyRestApplied = false
  while (remaining > 0.001) {
    if (!weeklyRestApplied && isSunday(current)) {
      current = new Date(current.getTime() + weeklyRestMinutes * 60000)
      weeklyRestApplied = true
      weeklyRestCount += 1
      continuousDriving = 0
      dailyDriving = 0
      continue
    }
    const continuousRemaining = MAX_CONTINUOUS_DRIVING_MINUTES - continuousDriving
    const dailyRemaining = MAX_DAILY_DRIVING_MINUTES - dailyDriving
    if (dailyRemaining <= 0.001) {
      current = new Date(current.getTime() + DAILY_REST_MINUTES * 60000)
      dailyRestCount += 1
      continuousDriving = 0
      dailyDriving = 0
      continue
    }
    if (continuousRemaining <= 0.001) {
      current = new Date(current.getTime() + MANDATORY_BREAK_MINUTES * 60000)
      breakCount += 1
      continuousDriving = 0
      continue
    }
    const leg = Math.min(remaining, continuousRemaining, dailyRemaining)
    current = new Date(current.getTime() + leg * 60000)
    remaining -= leg
    continuousDriving += leg
    dailyDriving += leg
  }
  return { arrivalAt: current, breakCount, dailyRestCount, weeklyRestCount, weeklyRestMinutes: weeklyRestCount ? weeklyRestMinutes : 0 }
}

function restPlanningText(label, plan) {
  const parts = [`${label}: ${plan.breakCount} Fahrpause${plan.breakCount === 1 ? '' : 'n'} à 45 Min.`, `${plan.dailyRestCount} tägliche Ruhezeit${plan.dailyRestCount === 1 ? '' : 'en'} à 11 Std.`]
  if (plan.weeklyRestCount) parts.push(`${plan.weeklyRestMinutes / MINUTES_PER_HOUR} Std. Wochenendruhe eingeplant`)
  return parts.join(' · ')
}

/**
 * Deliberately deterministic and explainable first forecast. It never writes a
 * carrier ETA into tracking fields and makes every missing input an assumption.
 */
export function buildShipmentTrackingForecast({ tracking = {}, imported = {}, route = {}, events = [], settings: value, now = new Date() } = {}) {
  const settings = normalizeShipmentTrackingForecastSettings(value)
  const actualUnloading = shipmentTrackingDate(tracking.actualArrivalUnloadingAt)
  const earliestLoading = shipmentTrackingDate(imported?.loading?.window?.from) || shipmentTrackingDate(imported?.loading?.window?.until)
  const latestLoading = shipmentTrackingDate(imported?.loading?.window?.until) || earliestLoading
  const earliestUnloading = shipmentTrackingDate(imported?.unloading?.window?.from) || shipmentTrackingDate(imported?.unloading?.window?.until)
  const latestUnloading = shipmentTrackingDate(imported?.unloading?.window?.until) || earliestUnloading
  if (actualUnloading) {
    return { kind: 'arrival', state: actualUnloading <= latestUnloading ? 'green' : 'yellow', actualArrivalUnloadingAt: serializableDate(actualUnloading), loadingSlotStartAt: serializableDate(earliestLoading), loadingSlotEndAt: serializableDate(latestLoading), slotStartAt: serializableDate(earliestUnloading), deadlineAt: serializableDate(latestUnloading), message: actualUnloading <= latestUnloading ? 'Tatsächliche Ankunft innerhalb des Entladefensters.' : 'Tatsächliche Ankunft nach dem Ende des Entladefensters.' }
  }
  const vehicle = vehicleForecastProfile(imported?.shipment?.vehicleType, settings)
  const actualDeparture = shipmentTrackingDate(tracking.actualDepartureLoadingAt)
  const actualArrivalLoading = shipmentTrackingDate(tracking.actualArrivalLoadingAt)
  const estimatedArrivalLoading = shipmentTrackingDate(tracking.estimatedArrivalLoadingAt)
  const source = actualDeparture ? 'actual_departure_loading' : actualArrivalLoading ? 'actual_arrival_loading' : estimatedArrivalLoading ? 'estimated_arrival_loading' : null
  if (!source) return { kind: 'none', state: 'none', message: 'Keine Prognosegrundlage vorhanden.' }
  const plannedDistanceKm = routeDistance(route)
  const transit = activeTransitContext(events, actualDeparture, now)
  const distanceKm = transit.distanceKm ?? plannedDistanceKm
  if (!distanceKm || !latestUnloading) return { kind: 'none', state: 'none', source, message: !distanceKm ? 'Planstrecke fehlt.' : 'Entladezeit fehlt.' }
  const base = actualDeparture || actualArrivalLoading || estimatedArrivalLoading
  const loadingOffset = actualDeparture ? 0 : vehicle.loadingDurationHours
  const departureAssumedAt = transit.positionAt ? now : new Date(base.getTime() + loadingOffset * MILLIS_PER_HOUR)
  const driverCount = tracking.driverCount === 2 ? 2 : 1
  const driverFactor = driverCount === 2 ? 0.92 : 1
  const speeds = { optimistic: 70, realistic: 65, pessimistic: 60 }
  const scenarioPlans = Object.fromEntries(Object.entries(speeds).map(([scenario, speed]) => {
    const drivingMinutes = (distanceKm / speed) * driverFactor * MINUTES_PER_HOUR
    const weeklyRestMinutes = scenario === 'pessimistic' ? REGULAR_WEEKLY_REST_MINUTES : REDUCED_WEEKLY_REST_MINUTES
    return [scenario, regulatedArrival({ startAt: departureAssumedAt, drivingMinutes, activePauseMinutes: transit.pauseMinutes, weeklyRestMinutes })]
  }))
  const arrivals = Object.fromEntries(Object.entries(scenarioPlans).map(([scenario, plan]) => [scenario, plan.arrivalAt]))
  const start = arrivals.optimistic.getTime()
  const end = arrivals.pessimistic.getTime()
  const deadline = latestUnloading.getTime()
  const onTimeSharePercent = end <= start ? (start <= deadline ? 100 : 0) : Math.max(0, Math.min(100, ((Math.min(deadline, end) - start) / (end - start)) * 100))
  const expiresAt = actualDeparture ? null : new Date(base.getTime() + vehicle.loadingDurationHours * MILLIS_PER_HOUR)
  const expired = Boolean(expiresAt && now.getTime() > expiresAt.getTime())
  const assumptions = [
    `Fahrzeugprofil: ${vehicle.label} (${vehicle.loadingDurationHours} Std. kalkulatorische Beladung)${vehicle.assumed ? ' · Annahme' : ''}`,
    `${driverCount} Fahrer${tracking.driverCount === 2 ? '' : ' · Annahme'}`,
    'Szenarien: 70 / 65 / 60 km/h; je Fahrtag maximal 4,5 Std. Lenkzeit bis 45 Min. Pause und maximal 9 Std. Lenkzeit vor 11 Std. täglicher Ruhezeit.',
    'Die Abfahrtsgrundlage wird als Beginn eines neuen Fahrtags behandelt, weil Tachograph- und vorherige Ruhezeitdaten nicht vorliegen.',
    restPlanningText('Optimistisch', scenarioPlans.optimistic),
    restPlanningText('Realistisch', scenarioPlans.realistic),
    restPlanningText('Pessimistisch', scenarioPlans.pessimistic),
  ]
  if (Object.values(scenarioPlans).some((plan) => plan.weeklyRestCount)) assumptions.push('Wochenendplanung: Bei einer Fahrt bis Sonntag ist in optimistisch/realistisch eine reduzierte Wochenruhe von 24 Std. und pessimistisch eine reguläre Wochenruhe von 45 Std. berücksichtigt. Die tatsächliche gesetzliche Fälligkeit hängt von den nicht vorliegenden Lenk- und Ruhezeiten des Fahrers ab.')
  else assumptions.push('Wochenendplanung: Die berechnete Fahrt reicht nicht bis zu einem Sonntag; deshalb wurde keine Wochenendruhe zusätzlich angesetzt.')
  if (transit.positionAt) assumptions.push(`Aktuelle Standortmeldung vom ${transit.positionAt.toISOString()}: ${distanceKm} km Reststrecke; Berechnung ab jetzt.`)
  else assumptions.push(`Streckenbasis: ${plannedDistanceKm} km Planstrecke.`)
  if (transit.pauseMinutes > 0) assumptions.push(`Laufende Pause: verbleibende ${transit.pauseMinutes} Minuten eingerechnet.`)
  const reportedArrivalUnloading = shipmentTrackingDate(tracking.estimatedArrivalUnloadingAt)
  if (reportedArrivalUnloading) assumptions.push(`Gemeldete voraussichtliche Entladeankunft: ${reportedArrivalUnloading.toISOString()} (Referenz, keine Überschreibung der Prognose).`)
  return {
    kind: 'forecast', state: expired ? 'grey' : forecastColor(onTimeSharePercent, settings), source, createdAt: serializableDate(now), expiresAt: serializableDate(expiresAt), loadingSlotStartAt: serializableDate(earliestLoading), loadingSlotEndAt: serializableDate(latestLoading), loadingFacts: { estimatedArrivalAt: serializableDate(estimatedArrivalLoading), actualArrivalAt: serializableDate(actualArrivalLoading), actualDepartureAt: serializableDate(actualDeparture) }, slotStartAt: serializableDate(earliestUnloading), deadlineAt: serializableDate(latestUnloading), distanceKm, driverCount,
    vehicle: { id: vehicle.id, label: vehicle.label, loadingDurationHours: vehicle.loadingDurationHours, assumed: vehicle.assumed },
    inputs: { sourceAt: serializableDate(base), plannedDistanceKm, usedDistanceKm: distanceKm, positionAt: serializableDate(transit.positionAt), activePauseMinutes: transit.pauseMinutes, reportedArrivalUnloadingAt: serializableDate(reportedArrivalUnloading), regulatedRestPlanning: Object.fromEntries(Object.entries(scenarioPlans).map(([scenario, plan]) => [scenario, { breakCount: plan.breakCount, dailyRestCount: plan.dailyRestCount, weeklyRestHours: plan.weeklyRestMinutes / MINUTES_PER_HOUR }])) },
    departureAssumedAt: serializableDate(departureAssumedAt), arrivals: Object.fromEntries(Object.entries(arrivals).map(([key, item]) => [key, serializableDate(item)])), onTimeSharePercent, thresholds: { red: settings.redThresholdPercent, green: settings.greenThresholdPercent }, assumptions,
  }
}
