import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import ShipmentTrackingOperatingHoursPanel from '../components/admin/ShipmentTrackingOperatingHoursPanel.jsx'
import ShipmentTrackingArrivalConfirmationPanel from '../components/admin/ShipmentTrackingArrivalConfirmationPanel.jsx'
import ShipmentTrackingRuleCatalogPanel from '../components/admin/ShipmentTrackingRuleCatalogPanel.jsx'
import ShipmentTrackingForecastPanel from '../components/admin/ShipmentTrackingForecastPanel.jsx'
import '../styles/admin.css'

export default function ShipmentTrackingAdminPage() {
  return <main className="admin-page shipment-tracking-admin-page">
    <header className="shipment-tracking-admin-page__intro">
      <h2><StaticText source={"Sendungsverfolgung"} /></h2>
      <p><StaticText source={"Hier werden die globalen Betriebszeiten, Regelstufen und die unabhängige ETA-Ladestelle-Anfrage gepflegt. Partner-Einstellungen wie „Kennzeichen wichtig“ oder aktivierte Anfragen werden weiterhin direkt beim jeweiligen Kunden oder Unternehmer verwaltet."} /></p>
    </header>
    <TranslatedProps sources={{"aria-label":"So werden Änderungen wirksam"}}><section className="shipment-tracking-admin-page__workflow" aria-label="So werden Änderungen wirksam">
      <strong><StaticText source={"So werden Änderungen wirksam"} /></strong>
      <ol>
        <li><StaticText source={"Betriebszeiten oder Ausnahmen anpassen und dort speichern."} /></li>
        <li><StaticText source={"Die ETA-Ladestelle-Anfrage und ihre Vorlaufzeit prüfen; die Mailvorlage wird unter Systemmails verwaltet."} /></li>
        <li><StaticText source={"Regelstufen und Partner-Einstellungen separat beim jeweiligen Kunden oder Unternehmer speichern."} /></li>
      </ol>
    </section></TranslatedProps>
    <ShipmentTrackingOperatingHoursPanel />
    <ShipmentTrackingArrivalConfirmationPanel />
    <ShipmentTrackingRuleCatalogPanel />
    <ShipmentTrackingForecastPanel />
  </main>
}
