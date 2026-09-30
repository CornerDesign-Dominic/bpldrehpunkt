import ShipmentTrackingOperatingHoursPanel from '../components/admin/ShipmentTrackingOperatingHoursPanel.jsx'
import ShipmentTrackingArrivalConfirmationPanel from '../components/admin/ShipmentTrackingArrivalConfirmationPanel.jsx'
import ShipmentTrackingRuleCatalogPanel from '../components/admin/ShipmentTrackingRuleCatalogPanel.jsx'
import '../styles/admin.css'

export default function ShipmentTrackingAdminPage() {
  return <main className="admin-page shipment-tracking-admin-page">
    <header className="shipment-tracking-admin-page__intro">
      <h2>Sendungsverfolgung</h2>
      <p>Hier werden die globalen Betriebszeiten, Regelstufen und die unabhängige Kurz-vor-Ladung-Anfrage gepflegt. Partner-Einstellungen wie „Kennzeichen wichtig“ oder aktivierte Anfragen werden weiterhin direkt beim jeweiligen Kunden oder Unternehmer verwaltet.</p>
    </header>
    <section className="shipment-tracking-admin-page__workflow" aria-label="So werden Änderungen wirksam">
      <strong>So werden Änderungen wirksam</strong>
      <ol>
        <li>Betriebszeiten oder Ausnahmen anpassen und dort speichern.</li>
        <li>Die Kurz-vor-Ladung-Anfrage sowie ihre Vorlaufzeit und Mailvorlage prüfen.</li>
        <li>Regelstufen und Partner-Einstellungen separat beim jeweiligen Kunden oder Unternehmer speichern.</li>
      </ol>
    </section>
    <ShipmentTrackingOperatingHoursPanel />
    <ShipmentTrackingArrivalConfirmationPanel />
    <ShipmentTrackingRuleCatalogPanel />
  </main>
}
