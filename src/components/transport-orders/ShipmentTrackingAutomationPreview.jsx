import { FaCircleInfo } from 'react-icons/fa6'
import { shipmentTrackingDryRunPresentation } from '../../lib/shipmentTrackingDryRunPresentation.js'

export default function ShipmentTrackingAutomationPreview({ preview, loading = false, error = '' }) {
  const model = shipmentTrackingDryRunPresentation(preview)
  if (loading) return <p className="shipment-tracking-automation-preview__state">Automatik-Vorschau wird berechnet …</p>
  if (error) return null
  return <details className="shipment-tracking-automation-preview"><summary>Automatik-Vorschau</summary>{model.entries.length ? <ol>{model.entries.map((entry) => <li key={entry.id} className={`shipment-tracking-automation-preview__entry shipment-tracking-automation-preview__entry--${entry.status}`}><strong>{entry.time} · {entry.topic}</strong><span>{entry.title} · {entry.recipient}</span>{entry.reason && <span>{entry.reason}</span>}{entry.adjustmentReason && <span className="shipment-tracking-automation-preview__adjustment"><FaCircleInfo aria-hidden="true" />{entry.adjustmentReason}</span>}{entry.status === 'notRequired' && <span className="shipment-tracking-automation-preview__not-required">Nicht erforderlich</span>}{entry.status === 'sent' && <span className="shipment-tracking-automation-preview__not-required">Manuell versendet</span>}</li>)}</ol> : <p>{model.emptyMessage}</p>}</details>
}
