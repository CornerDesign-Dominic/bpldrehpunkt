import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const requestOptions = [
  { id: 'shipment_tracking_arrival_request', label: 'Ankunft' },
  { id: 'shipment_tracking_license_plate_request', label: 'Kennzeichen' },
  { id: 'shipment_tracking_license_plate_and_arrival_request', label: 'Ankunft + KZ' },
  { id: 'shipment_tracking_general_status_update', label: 'Allg. Update' },
  { id: 'shipment_tracking_unloading_eta_request', label: 'ETA Entladestelle' },
  { id: 'shipment_tracking_loading_update_request', label: 'Update Beladung' },
  { id: 'shipment_tracking_unloading_update_request', label: 'Update Entladung' },
]

function recipientEmail(tracking) {
  const email = tracking?.recipients?.carrier?.email
  return typeof email === 'string' && email.trim() ? email.trim() : ''
}

export default function ShipmentTrackingRecipientsCard({ tracking, canEdit, canDispatch, saving, onSaveRecipient, onOpenMailTemplate, onManualDispatch, manualDispatchBundles = [] }) {
  const carrier = recipientEmail(tracking)
  const [carrierEmail, setCarrierEmail] = useState(carrier)
  const [validationError, setValidationError] = useState('')
  const changed = carrierEmail.trim() !== carrier

  function saveRecipient(event) {
    event.preventDefault()
    const email = carrierEmail.trim()
    if (email && !emailPattern.test(email)) {
      setValidationError('Bitte eine gültige Unternehmer-E-Mail eingeben.')
      return
    }
    setValidationError('')
    onSaveRecipient?.(email || null)
  }

  function dispatch(templateId) {
    const bundles = manualDispatchBundles.filter((bundle) => bundle.templateId === templateId)
    onManualDispatch?.({ templateId, bundles })
  }

  return <section className="shipment-tracking-recipients" aria-labelledby="shipment-tracking-recipients-heading">
    <h4 id="shipment-tracking-recipients-heading"><StaticText source={"Statusanfrage an Unternehmer"} /></h4>
    <form className="shipment-tracking-recipients__recipient" onSubmit={saveRecipient} noValidate>
      <label className="form-field"><span><StaticText source={"Unternehmer-E-Mail"} /></span><input type="email" value={carrierEmail} maxLength="320" autoComplete="email" disabled={!canEdit || saving} onChange={(event) => setCarrierEmail(event.target.value)} placeholder="mail@unternehmen.de" /></label>
      {canEdit && <button className="button" type="submit" disabled={saving || !changed}>{<StaticText source={saving ? 'Wird gespeichert …' : 'Änderung speichern'} />}</button>}
    </form>
    {validationError && <p className="form-error shipment-tracking-recipients__error">{validationError}</p>}
    {!carrier && !changed && <p className="shipment-tracking-recipients__warning"><StaticText source={"Für den Direktversand zuerst eine Unternehmer-E-Mail hinterlegen."} /></p>}
    <div className="shipment-tracking-recipients__methods">
      <section className="shipment-tracking-recipients__method" aria-labelledby="shipment-tracking-system-mail-heading">
        <h5 id="shipment-tracking-system-mail-heading"><StaticText source={"Anfrage manuell auslösen"} /></h5>
        <div className="shipment-tracking-recipients__buttons">{canDispatch && requestOptions.map((option) => <button className="button" type="button" key={option.id} disabled={saving || !carrier} onClick={() => dispatch(option.id)}>{option.label}</button>)}</div>
      </section>
      <section className="shipment-tracking-recipients__method" aria-labelledby="shipment-tracking-outlook-heading">
        <h5 id="shipment-tracking-outlook-heading"><StaticText source={"Anfrage als Outlook Entwurf öffnen"} /></h5>
        <div className="shipment-tracking-recipients__buttons">{canDispatch && requestOptions.map((option) => <button className="button button--secondary" type="button" key={option.id} disabled={saving || !carrier} onClick={() => onOpenMailTemplate?.(option.id)}>{option.label}</button>)}</div>
      </section>
    </div>
  </section>
}
