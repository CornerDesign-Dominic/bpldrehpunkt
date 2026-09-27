import ShipmentTrackingOperatingHoursPanel from '../components/admin/ShipmentTrackingOperatingHoursPanel.jsx'
import ShipmentTrackingRuleCatalogPanel from '../components/admin/ShipmentTrackingRuleCatalogPanel.jsx'
import '../styles/admin.css'

export default function ShipmentTrackingAdminPage() {
  return <main className="admin-page shipment-tracking-admin-page">
    <header className="shipment-tracking-admin-page__intro">
      <h2>Sendungsverfolgung</h2>
      <p>Hier werden die globalen Betriebszeiten und Regelstufen gepflegt. Partner-Einstellungen wie „Kennzeichen wichtig“ oder aktivierte Erinnerungen werden weiterhin direkt beim jeweiligen Kunden oder Unternehmer verwaltet.</p>
    </header>
    <section className="shipment-tracking-admin-page__workflow" aria-label="So werden Änderungen wirksam">
      <strong>So werden Änderungen wirksam</strong>
      <ol>
        <li>Betriebszeiten oder Ausnahmen anpassen und dort speichern.</li>
        <li>Regelstufen prüfen und den Regelkatalog anlegen bzw. aktualisieren.</li>
        <li>Partner-Einstellungen separat beim jeweiligen Kunden oder Unternehmer speichern.</li>
      </ol>
    </section>
    <ShipmentTrackingOperatingHoursPanel />
    <ShipmentTrackingRuleCatalogPanel />
  </main>
}
