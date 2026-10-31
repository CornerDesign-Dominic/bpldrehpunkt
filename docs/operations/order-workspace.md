# Auftragsbereich und Sendungsverfolgung

Stand: 31.10.2026. Lokal auf `codex/order-workspace`, Grundlage `d64e363`
(veröffentlichter Dev-Stand einschließlich DyCoS-Feldklärung und Kostenprüfung).
Die Erweiterung ist nach ausdrücklicher Freigabe auf Dev veröffentlicht.
[Release und echte Abnahme](order-workspace-dev-release.md). Produktion bleibt unverändert.

## Benutzerablauf

`/transportauftraege` führt zur eigenständigen Auftragsliste, die Detailroute
`/transportauftraege/:transportOrderId` zur Auftragsakte. Die bisherige operative
Oberfläche liegt unter `/sendungsverfolgung` und der entsprechenden Detailroute.
Beide Bereiche referenzieren dieselbe Auftrags-ID. Aus der Sendungsverfolgung
wurden keine Informationen oder Funktionen entfernt. Bestehende fachliche
Auftragsverweise aus Fällen, Aufgaben und Paletten führen jetzt zum Auftrag.

Die Übersicht zeigt zwei Spalten mit allgemeinen Daten und eine rechte Spalte
mit Verknüpfungen. Fachreiter: Übersicht, Transport & Ware, Geschäftspartner,
Finanzen, Historie. Tatsächlich übermittelte Stationen bleiben vollständig
erhalten. Alte CSV-Daten können erste/letzte Station liefern; fehlende Warenmaße,
Finanzwerte oder Belege werden nicht erfunden. Das Auftragsergebnis ist die
Differenz der übermittelten Nettoerträge und Nettokosten, kein zusätzlicher
buchhalterischer Abschlussstatus.

Die Finanzansicht verwendet die veröffentlichte Belegklassifikation aus
`dycosOrderDocuments.js`: interne Kopf-ID als Identität, interne und externe
Nummern getrennt, Stornobelege mit Originalbezug. Es gibt keine manuell
nachzupflegenden Bezahlt-/Offen-Zustände und keine Rechnungserstellung.

## Aktualisierung

`refreshTransportOrderWorkspace` nimmt `orderId`, `scope` und eine vom Client
erzeugte `requestId` entgegen:

- `all` (Übersicht): Auftrag und anschließend aktuelle verknüpfte Stammdaten.
- `order` (Transport & Ware / Finanzen): vollständiger Auftrag, keine behauptete
  selektive SQL-Abfrage. Bestehende TA-Importregeln bleiben wirksam.
- `partners` (Geschäftspartner): verknüpfte Stammdaten nach bestehender Logik.

Aktualisierung verändert gemeinsame Stammdaten, nicht nur die Anzeige dieses
Auftrags. Bestehende Konfliktentscheidungen und manuelle Trackingempfänger
bleiben gemäß den bestehenden Importverträgen geschützt. Nach einem
fehlgeschlagenen Auftragsabruf werden keine möglicherweise veralteten Partner
als neue Zuordnung aktualisiert.

Jeder angenommene Abruf besitzt einen serverseitigen Beleg unter
`transportOrders/{id}/refreshes/{recordId}` mit Benutzer, Start-/Endzeit,
Umfang und Ergebnis. Erfolgreiche, unveränderte, teilweise erfolgreiche und
fehlgeschlagene Abläufe erscheinen in der Historie. Neben dem Button stehen
nur Zeitpunkt/knapper Zustand und ein Verweis zur Historie. Frühere erfolgreiche
Abrufe bleiben nachvollziehbar. Details stehen ausschließlich im Fachreiter.

Reservierungen in `transportOrderWorkspaceRequests` und
`transportOrderWorkspaceLocks` schützen Wiederholungen und parallele Abrufe.
Eine unterbrochene Anfrage wird nicht blind erneut ausgeführt. Ein unbekannter
Ausgang bedeutet nicht, dass keine Daten gespeichert wurden. Der Client hält bei
technischem Fehler dieselbe Anfrage-ID für einen erneuten Prüfversuch vor.

## Rechte, Listen und Diagnose

Beide Bereiche verwenden weiterhin `transportOrders`. Lesen erfordert `view`;
Auftragsabrufe zusätzlich `dataImports: edit`, Stammdatenabrufe zusätzlich
`masterData: edit`. `all` benötigt beide Bearbeitungsrechte. Die serverseitigen
Prüfungen gelten unabhängig von der Buttonsichtbarkeit.

Refreshbelege sind nur für Auftragsleser lesbar, Clientschreiben ist gesperrt.
Reservierungen besitzen keine direkten Browserrechte. Auftragslisten verwenden
`listTransportOrderRecordsPage` ohne Trackingabfragen oder Prognoseberechnung.
Vorhandene Listenprojektionen und Filter werden wiederverwendet. Die Auftragsliste zeigt TA-Nummer, Relation, Kunde, Unternehmer sowie Lade-/
Entladedaten. Kundenreferenzen bleiben suchbar, erscheinen jedoch nicht in der
TA-Zelle. Relation wird aus der vorhandenen Relationsliste ausgewählt. Kunde
und Unternehmer besitzen feste Desktopbreiten von je 220 px; lange Namen werden
gekürzt. Die vollständige Zeile ist ein nativer Auftragslink, auch für Tastatur
und neue Tabs. Kein Trackinglink und kein horizontaler Tabellen-Scrollbereich.
Persönliche
Auftragsfilter liegen benutzerbezogen lokal unter `drehpunkt.order-record-list`;
Trackingfilter behalten ihren bestehenden Profilvertrag. Fehler neuer Client-
Abläufe verwenden den geschützten Diagnosebereich `transport-orders` mit festen
Stufen und Texten, ohne freie Fachinhalte.

Historien werden seitenweise und begrenzt geladen, ältere Einträge sind explizit
nachladbar. Die vollständige fachliche Änderungshistorie bleibt zusätzlich über
das bestehende Historienmodal erreichbar.

## Veröffentlichung und Abnahme

Für die freigegebene Dev-Veröffentlichung gemeinsam bereitgestellt: Frontend, `listTransportOrderRecordsPage`,
`refreshTransportOrderWorkspace`, `reportClientDiagnostic` und Firestore-Rules.
Firebase-Ziel: `db-bpl-drehpunkt-dev`. Die neue Refreshfunktion verwendet die
bestehenden serverseitigen DyCoS-Secret-Bindungen. Keine neuen Zugangsdaten,
keine Datenmigration, keine neuen Fachrechte. Listen nutzen bestehende Indizes.

Eine synthetische Browserprüfung ersetzt keine angemeldete Dev-Abnahme mit
echten Schnittstellen. Echte Auftrags-/Stammdatenabrufe und Navigation sind auf Dev geprüft;
Teilfehler, Wiederholung und Rechteverweigerung sind durch Emulatorprüfungen
belegt. Der Releasebeleg unterscheidet diese Nachweise.

## Lokale Prüfung dieses Entwicklungsstands

Vollständiges ESLint, Produktionsbuild und Shared-Abgleich (42 Module) bestanden.
103 gezielte Modul-/Vertragstests und vier echte Firestore-Emulatorprüfungen
bestanden, keine davon übersprungen. Die Emulatorfälle verwenden ausschließlich
`demo-order-workspace`, synthetische Quellantworten und lokale Daten.

Eine isolierte Browser-Harness rendert die echten neuen Seiten, Belegkomponenten
und CSS. Datenzugriffe, Rechnungsprüfungsdialog und verknüpfte Fachkarten sind
mit Beispieldaten ersetzt; es gibt keine Firebase-/DyCoS-Verbindung. Geprüft:
dreispaltige Übersicht, Fachreiter, bestätigter Aktualisierungseintrag mit
Historienverweis, DE/EN und Hell/Dunkel, 25+2 Seitennavigation, erfolglose Suche
und Rückkehr vom separaten Verfolgungs-Testziel zum Auftrag. Dies bestätigt
keine echten Dialog-/Fachkartenänderungen oder Live-Schnittstellenabnahme.
Die ursprüngliche native Browsersteuerung konnte die Adresse nicht sicher
bestimmen; die Prüfung erfolgte anschließend in einem separat kontrollierten
In-App-Browser mit festem lokalem Ziel.

Bekannte bestehende Build-Warnung: Firebase-Bundle über 500 kB. Diese lokale
Vorprüfung ging der anschließend freigegebenen Dev-Veröffentlichung voraus.
Main und Produktion bleiben unverändert.
