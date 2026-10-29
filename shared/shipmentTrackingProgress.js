import { shipmentTrackingDate } from './shipmentTrackingTime.js'

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
  const history = missing.length ? {
    id: 'history-incomplete', severity: 'neutral', label: 'Historie unvollständig',
    detail: `Frühere Angaben fehlen: ${missing.map(([, , label]) => label).join(', ')}`,
    missingFields: missing.map(([field]) => field),
  } : null
  return { closed, unloaded, unloading, reachedUnloading, departed, loaded, loading, reachedLoading, history }
}
