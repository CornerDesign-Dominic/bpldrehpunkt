import { StaticText } from '../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { FaBan, FaClipboardCheck, FaEnvelope, FaFileCircleCheck, FaHouse, FaLocationDot, FaPause, FaStopwatch, FaTruck, FaTruckFast, FaWarehouse } from 'react-icons/fa6'
import { db } from '../lib/firebase.js'
import { LicensePlateIcon } from '../components/icons.jsx'
import { DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH, normalizeShipmentTrackingForecastSettings } from '../../shared/shipmentTrackingForecastSettings.js'

function HelpIcon({ tone = 'neutral', children }) { return <span className={`shipment-tracking-help-page__icon shipment-tracking-help-page__icon--${tone}`}>{children}</span> }

function ReferenceTable({ caption, rows }) {
  return <div className="shipment-tracking-help-page__table-frame"><table className="shipment-tracking-help-page__table"><caption>{caption}</caption><thead><tr><th scope="col">Symbol</th><th scope="col">Bedeutung</th><th scope="col">Erscheint, wenn …</th><th scope="col">Erledigt / verschwindet, wenn …</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td>{row.icon}</td><th scope="row">{row.label}</th><td>{row.appears}</td><td>{row.resolved}</td></tr>)}</tbody></table></div>
}

export default function ShipmentTrackingHelpPage() {
  const [settings, setSettings] = useState(DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS)
  useEffect(() => onSnapshot(doc(db, SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH), (snapshot) => setSettings(normalizeShipmentTrackingForecastSettings(snapshot.exists() ? snapshot.data() : DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS))), [])

  const transportRows = [
    { icon: <HelpIcon><FaClipboardCheck /></HelpIcon>, label: 'Vorbereitung', appears: 'Die Sendungsverfolgung startet. Kennzeichen und Stammdaten können parallel ergänzt werden.', resolved: 'Ein Kennzeichen ist hinterlegt. Diese Stufe kann auch während der Fahrt noch offen bleiben.' },
    { icon: <HelpIcon><FaWarehouse /></HelpIcon>, label: 'Ladestelle', appears: 'Eine Ladeankunft, Beladung oder Abfahrt wird erfasst.', resolved: 'Die tatsächliche Abfahrt von der Ladestelle ist hinterlegt.' },
    { icon: <HelpIcon><FaTruck /></HelpIcon>, label: 'Unterwegs', appears: 'Die tatsächliche Abfahrt von der Ladestelle ist hinterlegt.', resolved: 'Die tatsächliche Ankunft an der Entladestelle ist erfasst.' },
    { icon: <HelpIcon><FaLocationDot /></HelpIcon>, label: 'Standortmeldung', appears: 'Eine aktuelle Position mit Restkilometern wird erfasst.', resolved: 'Sie bleibt im Verlauf; eine neuere Standortmeldung wird im Zeitstrahl als aktuelle Meldung gezeigt.' },
    { icon: <HelpIcon><FaPause /></HelpIcon>, label: 'Pause', appears: 'Eine Pause wird mit Zeitpunkt und Dauer erfasst.', resolved: 'Sie bleibt im Verlauf und fließt bei einer Aktualisierung in die Prognose ein.' },
    { icon: <HelpIcon><FaWarehouse /></HelpIcon>, label: 'Entladestelle', appears: 'Die tatsächliche Ankunft oder die Entladung wird erfasst.', resolved: 'Die Entladung ist abgeschlossen. Die übrigen Stufen können weiterhin getrennt offen sein.' },
    { icon: <HelpIcon><FaFileCircleCheck /></HelpIcon>, label: 'Bewertung', appears: 'Nach dem Transport können Kunde und Unternehmer bewertet werden.', resolved: 'Alle erforderlichen Bewertungen sind gespeichert.' },
  ]
  const attentionRows = [
    { icon: <HelpIcon tone="critical"><FaBan /></HelpIcon>, label: 'Stoppschild · Automatik pausiert', appears: 'Die Sendungsverfolgungs-Automatik wurde manuell pausiert.', resolved: 'Die Automatik wird fortgesetzt.' },
    { icon: <HelpIcon tone="warning"><FaEnvelope /></HelpIcon>, label: 'Brief · Mail manuell prüfen', appears: 'Eine zugeordnete Eingangsmail wurde von der KI als prüfbedürftig oder fehlerhaft markiert.', resolved: 'Die Mail wurde fachlich entschieden bzw. ihr Status übernommen oder geklärt.' },
    { icon: <HelpIcon tone="warning"><LicensePlateIcon /></HelpIcon>, label: 'KZ · Kennzeichen fehlt', appears: 'Die Vorbereitung läuft und weder Zugmaschine noch Anhänger haben ein Kennzeichen.', resolved: 'Mindestens ein Kennzeichen ist hinterlegt.' },
    { icon: <HelpIcon tone="success"><FaStopwatch /></HelpIcon>, label: 'Stopuhr grün · Beladung läuft', appears: 'Das Fahrzeug ist an der Ladestelle, die Beladungsfrist läuft aber noch im Sollbereich.', resolved: 'Beladestart und Beladeende bzw. die nächste bestätigte Prozessangabe liegen vor.' },
    { icon: <HelpIcon tone="warning"><FaStopwatch /></HelpIcon>, label: 'Stopuhr gelb · beobachten / ergänzen', appears: 'Die gelbe Zeitgrenze ist erreicht – oder das Fahrzeug ist bereits abgefahren und Beladezeiten fehlen.', resolved: 'Die fehlenden Beladezeiten sind erfasst. Nach tatsächlicher Abfahrt bleibt diese Stopuhr bewusst gelb und wird nicht rot.' },
    { icon: <HelpIcon tone="critical"><FaStopwatch /></HelpIcon>, label: 'Stopuhr rot · Frist überschritten', appears: 'Vor der tatsächlichen Abfahrt fehlt an der Ladestelle eine fällige Beladungsangabe über der roten Zeitgrenze.', resolved: 'Die fehlende Angabe wird erfasst; nach tatsächlicher Abfahrt gilt stattdessen die gelbe Ergänzungsregel.' },
    { icon: <HelpIcon tone="info"><FaTruck /></HelpIcon>, label: 'Einfacher LKW · operative Rückmeldung', appears: 'Eine bestätigbare Ankunft, Abfahrt oder Entladeankunft fehlt. Die Farbe zeigt Info, grün, gelb oder rot nach Frist.', resolved: 'Die passende tatsächliche Angabe wird erfasst oder die nächste Prozessstufe ist erreicht.' },
  ]
  const forecastRows = [
    { icon: <HelpIcon tone="info"><FaTruckFast /></HelpIcon>, label: 'Bewegter LKW · Transportprognose', appears: 'Eine voraussichtliche/tatsächliche Ladeankunft oder tatsächliche Abfahrt wird neu erfasst oder geändert. Manuelles Aktualisieren berechnet sie erneut.', resolved: 'Mit der tatsächlichen Ankunft an der Entladestelle endet die weitere Prognoseberechnung.' },
    { icon: <HelpIcon tone="success"><FaTruckFast /></HelpIcon>, label: 'Prognose grün', appears: `Mindestens ${settings.greenThresholdPercent}% der optimistischen bis pessimistischen Ankunftsspanne liegen vor dem Ende des Entladefensters.`, resolved: 'Die Farbe wird bei der nächsten Berechnung neu bewertet oder durch die tatsächliche Entladeankunft beendet.' },
    { icon: <HelpIcon tone="warning"><FaTruckFast /></HelpIcon>, label: 'Prognose gelb', appears: `Der Anteil vor Slotende liegt zwischen ${settings.redThresholdPercent}% und ${settings.greenThresholdPercent}%.`, resolved: 'Die Farbe wird bei der nächsten Berechnung neu bewertet oder durch die tatsächliche Entladeankunft beendet.' },
    { icon: <HelpIcon tone="critical"><FaTruckFast /></HelpIcon>, label: 'Prognose rot', appears: `Höchstens ${settings.redThresholdPercent}% der Ankunftsspanne liegen vor dem Ende des Entladefensters.`, resolved: 'Die Farbe wird bei der nächsten Berechnung neu bewertet oder durch die tatsächliche Entladeankunft beendet.' },
    { icon: <HelpIcon tone="muted"><FaTruckFast /></HelpIcon>, label: 'Prognose grau', appears: 'Eine Prognose auf Basis einer alten Lade-ETA ist abgelaufen.', resolved: 'Eine neue Grundlage oder eine manuelle Aktualisierung erzeugt eine aktuelle Prognose.' },
    { icon: <HelpIcon tone="success"><FaHouse /></HelpIcon>, label: 'Haus · pünktlich angekommen', appears: 'Die tatsächliche Entladeankunft liegt spätestens am Ende des Entladefensters.', resolved: 'Dies ist der finale Prognosezustand; die Historie bleibt erhalten.' },
    { icon: <HelpIcon tone="warning"><FaHouse /></HelpIcon>, label: 'Haus · verspätet angekommen', appears: 'Die tatsächliche Entladeankunft liegt nach Ende des Entladefensters.', resolved: 'Dies ist der finale Prognosezustand; die Historie bleibt erhalten.' },
  ]

  return <main className="shipment-tracking-help-page"><header><h2><StaticText source="Sendungsverfolgung erklärt" /></h2><p>Die Stufen eines Transports, offene Hinweise und die Prognose sind bewusst getrennt. Deshalb kann beispielsweise die Vorbereitung noch offen sein, während das Fahrzeug bereits unterwegs ist.</p></header><section><h3>Chronologischer Transportablauf</h3><p>Die fünf Hauptstufen werden zeitlich dargestellt. Standortmeldungen und Pausen ergänzen die Phase „Unterwegs“ und bleiben nachvollziehbar im Verlauf.</p><ReferenceTable caption="Ablauf und Statusdaten" rows={transportRows} /></section><section><h3>Offene Hinweise</h3><p>Maximal drei Hinweise werden gleichzeitig angezeigt – kritische vor gelben, gelbe vor informativen Hinweisen. Sie lösen für sich keine neue automatische E-Mail aus.</p><ReferenceTable caption="Handlungsempfehlungen" rows={attentionRows} /><p><strong>Aktuelle Fristen:</strong> ohne Ladeankunft gelb {settings.timing.noArrivalYellowWorkingHours} / rot {settings.timing.noArrivalRedWorkingHours} Arbeitsstunden; mit Lade-ETA gelb {settings.timing.estimatedArrivalYellowWorkingHours} / rot {settings.timing.estimatedArrivalRedWorkingHours} Arbeitsstunden.</p></section><section><h3>Transportprognose</h3><p>Die Prognose stellt eine berechnete Spanne dar, keine garantierte Ankunft. Sie berücksichtigt die verfügbaren Fahrdaten, Pausen und die im Prognosefenster ausgewiesenen Annahmen.</p><ReferenceTable caption="Prognose und Abschluss" rows={forecastRows} /></section></main>
}
