import { TrackingHistoryIcon } from '../icons.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { translateStatic } from '../../i18n/autoTranslate.js'

const labels = { licensePlate: 'Kennzeichen', actualArrivalLoadingAt: 'Ladeankunft', loadingStartedAt: 'Beladestart', loadingCompletedAt: 'Beladeende', actualDepartureLoadingAt: 'Ladeabfahrt', actualArrivalUnloadingAt: 'Entladeankunft', unloadingStartedAt: 'Entladestart', unloadingCompletedAt: 'Entladeende' }

export default function ShipmentTrackingHistoryIndicator({ history, className = '' }) {
  const { language } = useLanguage()
  if (!history) return null
  const label = translateStatic(language, 'Historie unvollständig')
  const fields = (history.missingFields || []).map((field) => translateStatic(language, labels[field] || field)).join(', ')
  const detail = fields ? `${translateStatic(language, 'Frühere Angaben fehlen')}: ${fields}` : translateStatic(language, history.detail)
  return <span className={`shipment-tracking-history-indicator ${className}`} title={`${label}: ${detail}`} aria-label={`${label}: ${detail}`}><TrackingHistoryIcon /><span className="sr-only">{label}</span></span>
}
