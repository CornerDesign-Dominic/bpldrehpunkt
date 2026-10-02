import { DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, normalizeShipmentTrackingForecastSettings } from './shipmentTrackingForecastSettings.js'
import { shipmentTrackingDate } from './shipmentTrackingTime.js'

const MILLIS_PER_HOUR = 60 * 60 * 1000

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

/**
 * Deliberately deterministic and explainable first forecast. It never writes a
 * carrier ETA into tracking fields and makes every missing input an assumption.
 */
export function buildShipmentTrackingForecast({ tracking = {}, imported = {}, route = {}, events = [], settings: value, now = new Date() } = {}) {
  const settings = normalizeShipmentTrackingForecastSettings(value)
  const actualUnloading = shipmentTrackingDate(tracking.actualArrivalUnloadingAt)
  const latestUnloading = shipmentTrackingDate(imported?.unloading?.window?.until) || shipmentTrackingDate(imported?.unloading?.window?.from)
  if (actualUnloading) {
    return { kind: 'arrival', state: actualUnloading <= latestUnloading ? 'green' : 'yellow', actualArrivalUnloadingAt: serializableDate(actualUnloading), deadlineAt: serializableDate(latestUnloading), message: actualUnloading <= latestUnloading ? 'Tatsächliche Ankunft innerhalb des Entladefensters.' : 'Tatsächliche Ankunft nach dem Ende des Entladefensters.' }
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
  const arrivals = Object.fromEntries(Object.entries(speeds).map(([scenario, speed]) => [scenario, new Date(departureAssumedAt.getTime() + ((distanceKm / speed) * driverFactor * MILLIS_PER_HOUR) + transit.pauseMinutes * 60000)]))
  const start = arrivals.optimistic.getTime()
  const end = arrivals.pessimistic.getTime()
  const deadline = latestUnloading.getTime()
  const onTimeSharePercent = end <= start ? (start <= deadline ? 100 : 0) : Math.max(0, Math.min(100, ((Math.min(deadline, end) - start) / (end - start)) * 100))
  const expiresAt = actualDeparture ? null : new Date(base.getTime() + vehicle.loadingDurationHours * MILLIS_PER_HOUR)
  const expired = Boolean(expiresAt && now.getTime() > expiresAt.getTime())
  const assumptions = [
    `Fahrzeugprofil: ${vehicle.label} (${vehicle.loadingDurationHours} Std. kalkulatorische Beladung)${vehicle.assumed ? ' · Annahme' : ''}`,
    `${driverCount} Fahrer${tracking.driverCount === 2 ? '' : ' · Annahme'}`,
    'Szenarien: 70 / 65 / 60 km/h; keine nicht belegten Fahrverbote oder Lenkzeiten ergänzt.',
  ]
  if (transit.positionAt) assumptions.push(`Aktuelle Standortmeldung vom ${transit.positionAt.toISOString()}: ${distanceKm} km Reststrecke; Berechnung ab jetzt.`)
  else assumptions.push(`Streckenbasis: ${plannedDistanceKm} km Planstrecke.`)
  if (transit.pauseMinutes > 0) assumptions.push(`Laufende Pause: verbleibende ${transit.pauseMinutes} Minuten eingerechnet.`)
  const reportedArrivalUnloading = shipmentTrackingDate(tracking.estimatedArrivalUnloadingAt)
  if (reportedArrivalUnloading) assumptions.push(`Gemeldete voraussichtliche Entladeankunft: ${reportedArrivalUnloading.toISOString()} (Referenz, keine Überschreibung der Prognose).`)
  return {
    kind: 'forecast', state: expired ? 'grey' : forecastColor(onTimeSharePercent, settings), source, createdAt: serializableDate(now), expiresAt: serializableDate(expiresAt), deadlineAt: serializableDate(latestUnloading), distanceKm, driverCount,
    vehicle: { id: vehicle.id, label: vehicle.label, loadingDurationHours: vehicle.loadingDurationHours, assumed: vehicle.assumed },
    inputs: { sourceAt: serializableDate(base), plannedDistanceKm, usedDistanceKm: distanceKm, positionAt: serializableDate(transit.positionAt), activePauseMinutes: transit.pauseMinutes, reportedArrivalUnloadingAt: serializableDate(reportedArrivalUnloading) },
    departureAssumedAt: serializableDate(departureAssumedAt), arrivals: Object.fromEntries(Object.entries(arrivals).map(([key, item]) => [key, serializableDate(item)])), onTimeSharePercent, thresholds: { red: settings.redThresholdPercent, green: settings.greenThresholdPercent }, assumptions,
  }
}
