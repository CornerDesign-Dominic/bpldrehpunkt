export const SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH = 'systemSettings/shipmentTrackingForecast'

export const DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS = Object.freeze({
  redThresholdPercent: 15,
  greenThresholdPercent: 50,
  timing: Object.freeze({
    noArrivalYellowWorkingHours: 6,
    noArrivalRedWorkingHours: 2,
    estimatedArrivalYellowWorkingHours: 4,
    estimatedArrivalRedWorkingHours: 2,
    loadingStartYellowElapsedHours: 1,
    loadingStartRedElapsedHours: 2,
    loadingEndYellowElapsedHours: 1,
    loadingEndRedElapsedHours: 2,
    departureMissingRedElapsedHours: 2,
    estimatedDepartureRedElapsedHours: 1,
    unloadingYellowElapsedHoursBeforeDeadline: 2,
  }),
  vehicleProfiles: Object.freeze([
    Object.freeze({ id: 'small', label: 'Klein bis 7,5 t', loadingDurationHours: 1, aliases: ['sprinter', '3,5t', '3.5t', '7,5t', '7.5t', 'kleintransporter'] }),
    Object.freeze({ id: 'standard', label: 'Standard', loadingDurationHours: 2, aliases: ['tautliner', 'mega', 'megatrailer', 'jumbo', 'koffer', 'box', 'plane', 'sattelzug', 'lkw'] }),
    Object.freeze({ id: 'special', label: 'Spezial', loadingDurationHours: 3, aliases: ['tieflader', 'joloda', 'spezial'] }),
  ]),
})

function number(value, fallback, minimum, maximum) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

function aliases(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).map((item) => item.slice(0, 80)))].slice(0, 30)
}

export function normalizeShipmentTrackingForecastSettings(value) {
  const fallback = DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS
  const profiles = Array.isArray(value?.vehicleProfiles) && value.vehicleProfiles.length
    ? value.vehicleProfiles.slice(0, 20).map((profile, index) => ({
      id: typeof profile?.id === 'string' && /^[a-z0-9_-]{1,40}$/.test(profile.id) ? profile.id : `profile-${index + 1}`,
      label: typeof profile?.label === 'string' && profile.label.trim() ? profile.label.trim().slice(0, 80) : `Fahrzeugprofil ${index + 1}`,
      loadingDurationHours: number(profile?.loadingDurationHours, 2, 0.25, 24),
      aliases: aliases(profile?.aliases),
    }))
    : fallback.vehicleProfiles.map((profile) => ({ ...profile, aliases: [...profile.aliases] }))
  return {
    redThresholdPercent: number(value?.redThresholdPercent, fallback.redThresholdPercent, 0, 99),
    greenThresholdPercent: number(value?.greenThresholdPercent, fallback.greenThresholdPercent, 1, 100),
    timing: Object.fromEntries(Object.entries(fallback.timing).map(([key, fallbackValue]) => [key, number(value?.timing?.[key], fallbackValue, 0, 168)])),
    vehicleProfiles: profiles,
  }
}

export function validateShipmentTrackingForecastSettings(value) {
  const normalized = normalizeShipmentTrackingForecastSettings(value)
  if (normalized.redThresholdPercent >= normalized.greenThresholdPercent) throw new Error('Die rote Grenze muss kleiner als die grüne Grenze sein.')
  if (normalized.timing.noArrivalRedWorkingHours > normalized.timing.noArrivalYellowWorkingHours) throw new Error('Die rote Frist ohne Ladeankunft darf nicht vor der gelben Frist liegen.')
  if (normalized.timing.estimatedArrivalRedWorkingHours > normalized.timing.estimatedArrivalYellowWorkingHours) throw new Error('Die rote Frist mit Lade-ETA darf nicht vor der gelben Frist liegen.')
  if (!normalized.vehicleProfiles.some((profile) => profile.id === 'standard')) throw new Error('Ein Standard-Fahrzeugprofil ist erforderlich.')
  return normalized
}
