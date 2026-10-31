# Dev-Veröffentlichung: Auftragsfelder, Belege und Kunden-Stornorechnungen

Nutzerfreigabe am 31.10.2026 ausschließlich für Dev: alle bis dahin umgesetzten
DyCoS-Erweiterungen einschließlich Kunden-Stornorechnungen veröffentlichen.
Ziel `db-bpl-drehpunkt-dev`, Oberfläche `https://dev.drehpunktlogistik.de`.
Main-Baseline unverändert: `230c2ad86af9700118e2f1456746292241461efc`.

## Umfang

- Kundenkontakt aus `ImAuftrag`, Unternehmer-Versandkontakt aus
  `TAPerMailVersendetAn`, vollständige Dispositionsbemerkung. Standardadressen
  bleiben Stammdaten und werden nicht als Auftragsansprechpartner ausgegeben.
- Stationsreferenzen aus der jeweiligen `Zustellinformation`, Bemerkungen aus
  `Bemerkung`; keine falsche Zusammenfassung mehrerer Stationen.
- Getrennte interne/externe Belegnummern für die bestätigten Kundenrechnungen,
  Kundengutschriften und UTN-Rechnungsverbuchungen, mit korrekter Proforma-Angabe.
- Kunden-Stornorechnungen mit eigener Kopf-ID und eindeutigem Originalbezug;
  Originalstatus und Stornodatum getrennt von der Belegart. Originalverweis in
  derselben bestehenden Tabelle, keine neuen Spalten oder CSS-Änderungen.
- Automatisch übernommene Trackingempfänger folgen beim TA-Abruf der aktuellen
  Adresse; manuelle Bestätigungen einschließlich gleicher Adresse oder Leerung
  bleiben erhalten. Fehlende/ungültige automatische Ziele stoppen den Versand
  an die alte Adresse. Legacy ohne Auto-Herkunft bleibt unangetastet.
- Bestehende Historien erfassen tatsächliche Feld- und Empfängeränderungen.
  Zahlungsstatus weiterhin unbekannt, da keine bestätigte Zahlungsquelle vorliegt.

Feldentscheidungen und Sonderfälle:
[Feldklärung vom 31.10.2026](../reference/dycos-feldklaerung-2026-10-31.md).

## Integration und Serverbereitstellung

Dev-Basis `8ef2058` einschließlich bereits veröffentlichter Kosten-/Queue- und
Anmeldesitzungsänderungen integriert. Fachcommit `1d70395`, Zusammenführung
`626a5a1`. Die Versandprüfung erhält sowohl aktuelle Empfänger als auch die
neuen Auftrags-/Lebenszyklus-/Pausenprüfungen. Neue List-Projektion im
DyCoS-Import und begrenzte Hintergrundverarbeitung bleiben erhalten.

Gezielt erfolgreich aktualisiert, Region `europe-west3`:

- `fetchDycosTransportOrder`
- `updateManualShipmentTracking`
- `scheduledShipmentTrackingAutomation`
- `sendManualShipmentTrackingMail`
- `applyMailboxTracking`
- `processStatusMailAiOnCreate`
- `retryStatusMailAi`

Vorher/Nachher-Bestandsvergleich: weiterhin 170 Endpunkte; genau diese sieben
Code-Hashes geändert, alle sieben aktiv, keine Endpunkte angelegt oder gelöscht.
Secret-Bindungen unverändert. Keine Rules-, Index-, Storage-, Power-Automate-
oder Konfigurationsmigration, keine pauschale Neuübernahme vorhandener Daten.

## Prüfung und Frontend

Zusammengeführter Stand: 822 Modul-/Vertragstests, 57 Emulatorprüfungen,
vollständiges ESLint, Build und 42 Shared-Module erfolgreich. Kein Test
übersprungen. Bekannte Build-Warnung zu großen JavaScript-Dateien bleibt.
Emulatorfälle umfassen Import, Wiederholung, Vorher/Nachher-Historie,
automatische/manuelle Empfänger, Originalbezug und bestehende Hintergrundjobs.

Frontend einmal gemeinsam nach `dev` veröffentlichen. Vercel-Erfolg sowie
angemeldete Browserabnahme werden danach separat geprüft und lokal belegt.
Neue Quellfelder werden beim nächsten Einzel-/Sammelabruf bzw. Aktualisieren
geladen; die Veröffentlichung allein aktualisiert keine alten Auftragsdaten.
Main und Produktion bleiben unberührt.
