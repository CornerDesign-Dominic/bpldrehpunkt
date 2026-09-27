function recipientEmail(tracking, role) {
  const email = tracking?.recipients?.[role]?.email
  return typeof email === 'string' && email.trim() ? email.trim() : ''
}

export default function ShipmentTrackingRecipientsCard({ tracking, canEdit, saving, onEdit }) {
  const customer = recipientEmail(tracking, 'customer')
  const carrier = recipientEmail(tracking, 'carrier')
  return <section className="shipment-tracking-recipients" aria-labelledby="shipment-tracking-recipients-heading">
    <div className="shipment-tracking-recipients__heading"><h4 id="shipment-tracking-recipients-heading">Empfänger Sendungsverfolgung</h4>{canEdit && <button className="button button--secondary" type="button" disabled={saving} onClick={onEdit}>Bearbeiten</button>}</div>
    <dl><div><dt>Kunde</dt><dd className={customer ? '' : 'shipment-tracking-recipients__empty'}>{customer || 'Nicht hinterlegt'}</dd></div><div><dt>Unternehmer</dt><dd className={carrier ? '' : 'shipment-tracking-recipients__empty'}>{carrier || 'Nicht hinterlegt'}</dd></div></dl>
  </section>
}
