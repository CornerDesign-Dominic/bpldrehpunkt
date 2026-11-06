import { useLanguage } from '../../i18n/useLanguage.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { fieldLabels } from '../../lib/shipmentTrackingPresentation.js'
import { trackingDerivationLabels, trackingEventDerivations } from '../../lib/shipmentTrackingDerivation.js'

export default function ShipmentTrackingDerivation({ derivation, original = false, previous = false, field = null }) {
  const { language } = useLanguage()
  const labels = trackingDerivationLabels(derivation, language)
  if (!labels.length) return null
  const prefix = original ? language === 'en' ? 'Original AI suggestion: ' : 'Ursprünglicher KI-Vorschlag: ' : previous ? language === 'en' ? 'Previous value: ' : 'Vorheriger Wert: ' : ''
  return <p><small>{prefix}{field && <>{field === 'transitEntry' ? language === 'en' ? 'Position report' : 'Standortmeldung' : <StaticText source={fieldLabels[field] || field} />} · </>}{labels.join(' · ')}</small></p>
}

export function ShipmentTrackingEventDerivation({ event, fields = null }) {
  return trackingEventDerivations(event, fields).map((entry, index) => <ShipmentTrackingDerivation key={`${entry.kind}-${entry.field}-${index}`} derivation={entry.derivation} original={entry.kind === 'original'} previous={entry.kind === 'previous'} field={entry.field} />)
}
