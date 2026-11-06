import { shipmentTrackingDate } from './shipmentTrackingTime.js'

export function hasApproximateTrackingTime(tracking, field) {
  return tracking?.fieldSources?.[field]?.derivation?.timingApproximate === true
}

// Later confirmed facts establish progress, never missing timestamps.
export function shipmentTrackingProgress(tracking = {}) {
  const present = (field) => Boolean(shipmentTrackingDate(tracking[field]))
  const closed = tracking.lifecycleStatus === 'completed'
  const unloaded = present('unloadingCompletedAt') || closed
  const unloading = present('unloadingStartedAt') || unloaded
  const reachedUnloading = present('actualArrivalUnloadingAt') || unloading
  const departed = present('actualDepartureLoadingAt') || reachedUnloading
  const loaded = present('loadingCompletedAt') || departed
  const loading = present('loadingStartedAt') || loaded
  const reachedLoading = present('actualArrivalLoadingAt') || loading
  const fields = [
    ['actualArrivalLoadingAt', loading, 'Ladeankunft'],
    ['loadingStartedAt', loaded, 'Beladestart'],
    ['loadingCompletedAt', departed, 'Beladeende'],
    ['actualDepartureLoadingAt', reachedUnloading, 'Ladeabfahrt'],
    ['actualArrivalUnloadingAt', unloading, 'Entladeankunft'],
    ['unloadingStartedAt', unloaded, 'Entladestart'],
    ['unloadingCompletedAt', closed, 'Entladeende'],
  ]
  const missing = fields.filter(([field, passed]) => passed && !present(field))
  const hasPlate = ['licensePlate', 'tractorLicensePlate', 'trailerLicensePlate'].some((field) => typeof tracking[field] === 'string' && tracking[field].trim())
  if (reachedUnloading && !hasPlate) missing.unshift(['licensePlate', true, 'Kennzeichen'])
  const approximate = fields.filter(([field, passed]) => passed && present(field) && hasApproximateTrackingTime(tracking, field))
  const history = missing.length || approximate.length ? {
    id: 'history-incomplete', severity: 'neutral', label: 'Historie unvollständig',
    detail: [missing.length && `Frühere Angaben fehlen: ${missing.map(([, , label]) => label).join(', ')}`, approximate.length && `Genaue Zeiten unbekannt: ${approximate.map(([, , label]) => label).join(', ')}`].filter(Boolean).join(' · '),
    missingFields: missing.map(([field]) => field),
    ...(approximate.length ? { approximateFields: approximate.map(([field]) => field) } : {}),
  } : null
  return { closed, unloaded, unloading, reachedUnloading, departed, loaded, loading, reachedLoading, history }
}

// Closure changes presentation, not the recorded arrival or its assessment.
export function closedShipmentTrackingForecast(tracking = {}, imported = {}) {
  if (tracking.lifecycleStatus !== 'completed') return null
  const arrival = shipmentTrackingDate(tracking.actualArrivalUnloadingAt)
  const deadline = shipmentTrackingDate(imported?.unloading?.window?.until) || shipmentTrackingDate(imported?.unloading?.window?.from)
  return {
    kind: 'completed', state: 'neutral', message: 'Transport abgeschlossen',
    actualArrivalUnloadingAt: arrival ? arrival.toISOString() : null,
    ...(arrival && hasApproximateTrackingTime(tracking, 'actualArrivalUnloadingAt') ? { arrivalTimeApproximate: true } : {}),
    arrivalState: arrival && deadline && !hasApproximateTrackingTime(tracking, 'actualArrivalUnloadingAt') ? arrival <= deadline ? 'green' : 'yellow' : 'unknown',
  }
}
