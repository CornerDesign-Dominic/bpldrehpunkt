import { StaticText } from '../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { FaBan, FaClipboardCheck, FaEnvelope, FaFileCircleCheck, FaHouse, FaLocationDot, FaPause, FaStopwatch, FaTruck, FaTruckFast, FaWarehouse } from 'react-icons/fa6'
import { db } from '../lib/firebase.js'
import { LicensePlateIcon } from '../components/icons.jsx'
import { DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH, normalizeShipmentTrackingForecastSettings } from '../../shared/shipmentTrackingForecastSettings.js'
import { fallbackShipmentTrackingRuleCatalog, formatShipmentTrackingWorkingDuration, normalizeShipmentTrackingRuleCatalog, SHIPMENT_TRACKING_RULE_CATALOG_PATH } from '../../shared/shipmentTrackingRuleCatalog.js'
import { DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION, normalizeShipmentTrackingArrivalConfirmation, shipmentTrackingArrivalConfirmationPath } from '../../shared/shipmentTrackingArrivalConfirmation.js'

function HelpIcon({ tone = 'neutral', children }) { return <span className={`shipment-tracking-help-page__icon shipment-tracking-help-page__icon--${tone}`}>{children}</span> }

function ReferenceTable({ caption, rows }) {
  return <div className="shipment-tracking-help-page__table-frame"><table className="shipment-tracking-help-page__table"><caption>{caption}</caption><thead><tr><th scope="col">Symbol</th><th scope="col">Bedeutung</th><th scope="col">Erscheint, wenn …</th><th scope="col">Erledigt / verschwindet, wenn …</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td>{row.icon}</td><th scope="row">{row.label}</th><td>{row.appears}</td><td>{row.resolved}</td></tr>)}</tbody></table></div>
}

function AutomationTable({ rows }) {
  return <div className="shipment-tracking-help-page__table-frame"><table className="shipment-tracking-help-page__table"><caption>Automatische Statusanfragen an den Unternehmer</caption><thead><tr><th scope="col">Anfrage</th><th scope="col">Zeitpunkt</th><th scope="col">Erforderliche Einstellung</th><th scope="col">Wird nicht versendet, wenn …</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.when}</td><td>{row.setting}</td><td>{row.notSent}</td></tr>)}</tbody></table></div>
}

function externalRuleSchedule(catalog, topic) {
  const rules = catalog.topics?.[topic]
  if (!rules) return 'Die Regelzeiten sind nicht verfügbar.'
  return [
    `Erste Anfrage: ${formatShipmentTrackingWorkingDuration(rules.initialRequest?.offsetWorkingHours)} vorher`,
    ...(rules.reminders || []).map((rule, index) => `Erinnerung ${index + 1}: ${formatShipmentTrackingWorkingDuration(rule.offsetWorkingHours)} vorher`),
  ].join(' · ')
}

export default function ShipmentTrackingHelpPage() {
  const [settings, setSettings] = useState(DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS)
  const [ruleCatalog, setRuleCatalog] = useState(fallbackShipmentTrackingRuleCatalog)
  const [arrivalConfirmation, setArrivalConfirmation] = useState(DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION)
  useEffect(() => {
    const unsubscribeForecast = onSnapshot(doc(db, SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH), (snapshot) => setSettings(normalizeShipmentTrackingForecastSettings(snapshot.exists() ? snapshot.data() : DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS)))
    const unsubscribeCatalog = onSnapshot(doc(db, SHIPMENT_TRACKING_RULE_CATALOG_PATH), (snapshot) => setRuleCatalog(normalizeShipmentTrackingRuleCatalog(snapshot.exists() ? snapshot.data() : fallbackShipmentTrackingRuleCatalog())))
    const unsubscribeArrivalConfirmation = onSnapshot(doc(db, shipmentTrackingArrivalConfirmationPath), (snapshot) => setArrivalConfirmation(normalizeShipmentTrackingArrivalConfirmation(snapshot.exists() ? snapshot.data() : DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION)))
    return () => { unsubscribeForecast(); unsubscribeCatalog(); unsubscribeArrivalConfirmation() }
  }, [])

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
    { icon: <HelpIcon tone="muted"><FaTruckFast /></HelpIcon>, label: 'Prognose grau', appears: 'Die letzte Grundlage ist abgelaufen: Lade-ETA, tatsächliche Ladeankunft oder tatsächliche Abfahrt.', resolved: 'Je nach letzter Grundlage wird eine aktuelle Ladeankunft oder Ladeabfahrt benötigt; die passende Anfrage kann direkt im Hinweis geöffnet werden.' },
    { icon: <HelpIcon tone="success"><FaHouse /></HelpIcon>, label: 'Haus · pünktlich angekommen', appears: 'Die tatsächliche Entladeankunft liegt spätestens am Ende des Entladefensters.', resolved: 'Dies ist der finale Prognosezustand; die Historie bleibt erhalten.' },
    { icon: <HelpIcon tone="warning"><FaHouse /></HelpIcon>, label: 'Haus · verspätet angekommen', appears: 'Die tatsächliche Entladeankunft liegt nach Ende des Entladefensters.', resolved: 'Dies ist der finale Prognosezustand; die Historie bleibt erhalten.' },
  ]

  const automationRows = [
    { label: 'Kennzeichen anfragen', when: externalRuleSchedule(ruleCatalog, 'licensePlate'), setting: 'Im Unternehmer-Stammdatensatz unter „Sendungsverfolgung → Kennzeichen“ die jeweiligen Häkchen aktivieren.', notSent: 'ein Kennzeichen hinterlegt ist, die Automatik pausiert ist, der Status-Empfänger fehlt oder die Regel schon versendet wurde.' },
    { label: 'Informationen zur Ladestelle anfragen', when: externalRuleSchedule(ruleCatalog, 'loadingSite'), setting: 'Im Unternehmer-Stammdatensatz unter „Sendungsverfolgung → Ladestelle“ die jeweiligen Häkchen aktivieren.', notSent: 'eine tatsächliche Ladeankunft, ein Beladestatus oder eine Ladeabfahrt vorhanden ist, die Automatik pausiert ist, der Status-Empfänger fehlt oder die Regel schon versendet wurde.' },
    { label: 'Aktuellen Stand vor ETA Ladestelle anfragen', when: arrivalConfirmation.enabled ? `${arrivalConfirmation.offsetWorkingHours} Arbeitsstunden vor ETA Ladestelle.` : 'Global deaktiviert.', setting: 'Im Unternehmer-Stammdatensatz „Vor ETA Ladestelle aktuellen Stand anfragen“ aktivieren; die globale Einstellung muss ebenfalls aktiv sein.', notSent: 'keine ETA Ladestelle vorliegt, eine tatsächliche Ladeankunft bereits erfasst ist, die Automatik pausiert ist, der Transport abgeschlossen ist oder die ETA erst nach dem berechneten Versandzeitpunkt eingetroffen ist. In diesem Fall wird die Anfrage als verpasst markiert und muss manuell gesendet werden.' },
  ]

  return <main className="shipment-tracking-help-page"><header><h2><StaticText source="Sendungsverfolgung erklärt" /></h2><p>Die Stufen eines Transports, offene Hinweise und die Prognose sind bewusst getrennt. Deshalb kann beispielsweise die Vorbereitung noch offen sein, während das Fahrzeug bereits unterwegs ist.</p></header><section><h3>Chronologischer Transportablauf</h3><p>Die fünf Hauptstufen werden zeitlich dargestellt. Standortmeldungen und Pausen ergänzen die Phase „Unterwegs“ und bleiben nachvollziehbar im Verlauf.</p><ReferenceTable caption="Ablauf und Statusdaten" rows={transportRows} /></section><section><h3>Offene Hinweise</h3><p>Maximal drei Hinweise werden gleichzeitig angezeigt – kritische vor gelben, gelbe vor informativen Hinweisen. Sie lösen für sich keine neue automatische E-Mail aus.</p><ReferenceTable caption="Handlungsempfehlungen" rows={attentionRows} /><p><strong>Aktuelle Fristen:</strong> ohne Ladeankunft gelb {settings.timing.noArrivalYellowWorkingHours} / rot {settings.timing.noArrivalRedWorkingHours} Arbeitsstunden; mit Lade-ETA gelb {settings.timing.estimatedArrivalYellowWorkingHours} / rot {settings.timing.estimatedArrivalRedWorkingHours} Arbeitsstunden.</p></section><section><h3>Transportprognose</h3><p>Die Prognose stellt eine berechnete Spanne dar, keine garantierte Ankunft. Sie berücksichtigt die verfügbaren Fahrdaten, Pausen und die im Prognosefenster ausgewiesenen Annahmen.</p><ReferenceTable caption="Prognose und Abschluss" rows={forecastRows} /></section><section className="shipment-tracking-help-page__automation"><h3>Automatismus</h3><p>Der Automatismus prüft alle fünf Minuten. Regelzeiten werden in BPL-Arbeitszeiten berechnet und bei geschlossenen Zeiten auf den letzten zulässigen Zeitpunkt vorgezogen. Die ETA-Ladestelle-Anfrage richtet sich ausschließlich nach der hinterlegten ETA – nicht nach dem geplanten Ladetermin.</p><p><strong>Wichtig:</strong> Die Mail geht an die im Auftrag hinterlegte Status-Empfänger-E-Mail („TA zuletzt versendet an“), die beim Start übernommen und später im Auftrag geändert werden kann. Automatische externe Mails werden nur im Produktivbetrieb gesendet.</p><AutomationTable rows={automationRows} /><p><strong>Kunden-Stammdaten:</strong> „Kennzeichen wichtig“ und „Informationen zur Ladestelle wichtig“ lösen keine Mail an den Unternehmer aus. Sie ergänzen stattdessen die jeweilige interne BPL-Eskalation bzw. Priorisierung.</p><p><strong>Zusätzliche Voraussetzungen:</strong> Kunde und Unternehmer müssen dem Auftrag zugeordnet sein, die Sendungsverfolgung muss aktiv sein, die Status-Empfänger-E-Mail muss gültig sein und weder die Auftragsautomatik noch der globale automatische Mailversand dürfen pausiert sein.</p></section></main>
}
