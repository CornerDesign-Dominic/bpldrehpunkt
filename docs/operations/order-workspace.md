# Auftragsbereich und Sendungsverfolgung

Stand: 01.11.2026. Lokal auf `codex/order-workspace`, Grundlage `d64e363`
(veröffentlichter Dev-Stand einschließlich DyCoS-Feldklärung und Kostenprüfung).
Der bisherige Grundstand ist nach ausdrücklicher Freigabe auf Dev veröffentlicht.
Die am 01.11.2026 vorbereiteten Trackingbereinigungen, der breite Stationsablauf,
die Fixtermin-Übernahme, die zweispaltige Geschäftspartneransicht und der Mailreiter
sind ausschließlich lokal umgesetzt; eine Veröffentlichung ist noch nicht freigegeben.
[Release und echte Abnahme](order-workspace-dev-release.md). Produktion bleibt unverändert.

## Benutzerablauf

`/transportauftraege` führt zur Auftragsliste, `/sendungsverfolgung` zur
operativen Verfolgungsliste. Beide öffnen dieselbe Auftragsakte unter
`/transportauftraege/:transportOrderId`: Aufträge starten mit Übersicht,
Verfolgungen mit `?tab=tracking`. Bisherige Trackingdetailadressen leiten unter
Erhalt von Anfrageparametern, Hash und Rückkehrzustand auf diesen Reiter weiter.

Die Trackingdetailseite bleibt der operative Arbeitsbereich mit gemeinsamer
Reiterleiste. Lokal entfernt wurden der zusätzliche Link „Auftrag öffnen“, das
Drei-Punkte-Historienmenü und die doppelten Abschnitte Rechnungen/Gutschriften,
Ertragspositionen, Kostenpositionen und Warenangaben je Station. Diese Inhalte
bleiben in Finanzen beziehungsweise Transport & Ware zugänglich; die operative
Tracking-Ereignishistorie und die gemeinsamen Fachreiter bleiben erhalten.
Die rechte Tracking-Spalte mit Kontakten, Importinfos und eingegangenen Mails
entfällt lokal. „Zugeordnete Mails“ steht als zusätzlicher Dialogreiter in der
gemeinsamen Navigation zur Verfügung, ohne den aktiven Fachreiter zu wechseln.
Der Dialog zeigt links die zugeordneten Nachrichten, mittig ihren Textinhalt und
rechts den bestehenden Trackingeditor. Mitte und rechts starten gleich breit;
die Teilung lässt sich wie im Postfachdialog anpassen und separat merken.
Die neuesten 50 Nachrichten werden live geladen, ältere sind schrittweise
nachladbar; auch nachgeladene Nachrichten erhalten laufende KI-Statusänderungen.
Ein gemeinsamer Trackingentwurf bleibt beim Mailwechsel und beim Schließen und
Wiederöffnen innerhalb derselben Auftragsakte erhalten. Verlassen der Akte
beendet diesen lokalen Entwurf. Laden, Fehler mit Wiederholen und fehlende
Nachrichten beziehungsweise noch nicht gestartetes Tracking sind berücksichtigt.
Beim Öffnen werden aktuelle Trackingdaten gelesen; währenddessen sowie bei
Ladefehlern ist keine Bearbeitung veralteter Werte möglich. Die vorhandenen
Leserechte auf `receivedMails` und serverseitigen Bearbeitungsrechte gelten
unverändert. Es entsteht kein Zugriff auf persönliche Postfächer. Technische
Fehler beim Lesen, KI-Neustart oder Prüfabschluss nutzen die bestehende zentrale
Trackingdiagnose ohne Nachrichteninhalte zu protokollieren.
Geöffnete Auftrags- und Trackingbausteine bleiben beim Wechsel montiert, damit
Dialoge und Eingaben erhalten bleiben. Tracking wird erst beim ersten Öffnen
seines Reiters geladen; aktive Ansichten lesen beim Wiederöffnen den aktuellen
Auftrags-/Trackingstand. Beide Bereiche verwenden dieselbe Auftrags-ID und die
bestehenden Zugriffsrechte. Die Auftragsakte zeigt auf allen Fachreitern keinen
zusätzlichen Zurück-Button und keinen wiederholten Datenkopf mit TA-Nummer,
Strecke, Kundenreferenz und Relation. Die TA-Nummer bleibt im oberen Seitentitel;
die Fachinhalte und die Navigation über Listen und Reiter bleiben erhalten.

Die Übersicht zeigt zwei Spalten mit allgemeinen Daten und eine rechte Spalte
mit Verknüpfungen. Fachreiter: Übersicht, Transport & Ware, Geschäftspartner,
Finanzen, Sendungsverfolgung, Historie. Tatsächlich übermittelte Stationen bleiben vollständig
erhalten. Alte CSV-Daten können erste/letzte Station liefern; fehlende Warenmaße,
Finanzwerte oder Belege werden nicht erfunden. Das Auftragsergebnis ist die
Differenz der übermittelten Nettoerträge und Nettokosten, kein zusätzlicher
buchhalterischer Abschlussstatus.

Geschäftspartner nutzt lokal die gesamte Inhaltsbreite ohne Verknüpfungsspalte:
Kunde links und Unternehmer rechts in zwei gleich breiten Spalten. Die
zusätzliche Karte „Auftragsbezogene Angaben“ entfällt in diesem Reiter.
Stammdatenverknüpfungen, Kontakte und Aktualisierungsaktion bleiben verfügbar;
bei schmalen Ansichten stehen die Partnerkarten untereinander.

Transport & Ware nutzt im lokal vorbereiteten breiten Stationsablauf die volle
Breite ohne rechte Verknüpfungsspalte. Oben steht eine kompakte Transportübersicht
mit Fahrzeug, vorhandenen Kennzeichen, Auftragsmengen und Tour. Danach folgen
alle Stationen untereinander in einer gemeinsamen breiten Karte; den Abschluss
bildet ein vorhandener Dispositionshinweis. Fehlende Kennzeichen sowie die bisher
nur als Platzhalter sichtbaren Warenarten/Einzelmaße belegen keine eigenen Zeilen.

Jede Station ist innen zweispaltig: Adressblock und Termin links, vollständige
Hinweise, Referenzen, vorhandene Lieferscheinnummer und eine kompakte Zeile mit
Stationsmengen/Palettentausch rechts. Fehlende Adressen sind ausdrücklich markiert.
Dezente horizontale Linien trennen die Stationen. An schmalen Ansichten stehen
die Angaben untereinander. Mehrtägige Fenster behalten beide Daten; fehlende
Zeitgrenzen werden nicht ergänzt. Unter jeder Adresse stehen Termin und Fixtermin.
Lokal ergänzt ist die Übernahme von `LadeEntladestellen2.Fixtermin` über
`LadeEntladestellenID` nach `stops[].fixedAppointment` sowie in die Projektionen
`loading.fixedAppointment` und `unloading.fixedAppointment`. Bestätigte Werte
werden als boolean gespeichert und als Ja/Nein angezeigt; 0/1 werden an der
Schnittstellengrenze normalisiert. Fehlende Werte bleiben null bzw. bei alten
Datensätzen zunächst unbekannt, ungültige Werte brechen den Abruf ab.
Die Kennzeichnung wird nicht aus Uhrzeiten oder Freitext abgeleitet.
In der Tracking-Sollzeit und Prognosegrafik hat ein vorhandenes Quellkennzeichen
Vorrang vor der bisherigen zeitbasierten FIX-Beschriftung. Insbesondere darf
explizites false nicht als FIX erscheinen. Die Zeitgrenzen, Prognoserechnung
und Versandsteuerung werden dadurch nicht verändert. Altbestände ohne Flag
behalten bis zum erneuten Import ihre bisherige Tracking-Zeitdarstellung.
Änderungen des Kennzeichens sind in der Auftragshistorie nachvollziehbar.
Die bisherige separate Tabelle
„Warenangaben je Station“ entfällt in diesem Reiter. Gewicht, Kolli, Lademeter
und Palettentausch stehen direkt bei der jeweiligen Station; ihre Mengen
werden nicht zu Auftragssummen addiert. Auftragssummen kommen weiterhin allein
aus `imported.shipment`. Warenart und Einzelmaße sind im aktuellen Importvertrag
nicht enthalten und werden nicht abgeleitet.
Die bestehende operative Trackingansicht bleibt davon unberührt.

Für eine spätere Veröffentlichung dieses neuen Importfelds müssen Frontend und
die Import-Einstiege `fetchDycosTransportOrder` und `refreshTransportOrderWorkspace`
gemeinsam betrachtet werden. `reviewMailboxInvoices` verwendet denselben Mapper,
wertet das neue Flag für die Rechnungsprüfung aber nicht aus. Kein zusätzlicher
Flow-Abruf, keine Power-Automate-Änderung, keine neuen Rechte, Rules oder Indizes.
Bestehende Aufträge erhalten das Feld erst beim nächsten Auftragsabruf; kein
automatischer Massenimport. Noch keine Veröffentlichung dieser Erweiterung.

Die Finanzansicht zeigt rechts anstelle der Verknüpfungen die Karten
Auftragsergebnis und Rechnungsprüfung. Belege sowie einzelne Ertrags- und
Kostenpositionen bleiben links. Die bestehenden Prüfergebnisse öffnen sich
weiterhin im Rechnungsprüfungsdialog.
Die Finanzansicht verwendet die veröffentlichte Belegklassifikation aus
`dycosOrderDocuments.js`: interne Kopf-ID als Identität, interne und externe
Nummern getrennt, Stornobelege mit Originalbezug. Es gibt keine manuell
nachzupflegenden Bezahlt-/Offen-Zustände und keine Rechnungserstellung.

Die Auftragsakte gliedert die Abrechnungsbelege nach Kunde (KU) und Unternehmer
(UTN), jeweils mit interner/externer Nummer, fachlicher Belegart, internem Beleg,
Aussteller und Datum des internen Belegs. Nummern werden vollständig umgebrochen,
nicht abgeschnitten. Stornierte Originale und Stornobelege bleiben über die
persistente Belegidentität getrennt, auch bei derselben sichtbaren Nummer.
Bestätigte Ursprungsbezüge verlinken direkt auf den Originalbeleg. Proforma
bleibt als interne Verbuchung erkennbar. Belege mit ungeklärter Partnerseite
stehen separat; unbestätigte Typen, Nummern, Daten und Stornobezüge erhalten
konkrete Prüfhinweise. Fehlende Belege bedeuten keine bestätigte Aussage über
den Abrechnungsabschluss. Die Daten kommen aus dem bestehenden Auftragsabruf;
keine zusätzlichen Abfragen beim Öffnen dieser Darstellung.

Die Klassifikation weiterer Rechnungskorrekturen/Stornogutschriften bleibt
ohne fachlich verifizierte Quellbeispiele offen, siehe
[DyCoS-Feldklärung](../reference/dycos-feldklaerung-2026-10-31.md).
Diese Darstellung ändert weder Importregeln noch die operative Trackingansicht.

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

Der Reiter Historie zeigt ohne rechte Aktions-/Verknüpfungsspalte genau zwei
offene Tabellen untereinander über die gesamte Inhaltsbreite: Auftragshistorie
mit Feldänderungen und Aktualisierungsbelegen sowie Sendungsverfolgungshistorie
mit den tatsächlichen Trackingereignissen. Zusammengehörige Feldänderungen
teilen sich Zeitpunkt, Benutzer und Aktion in verbundenen Tabellenzellen;
alle Einzeländerungen bleiben in kompakten Zeilen sichtbar. Unterschiedliche
Vorgänge werden auch bei gleichem Zeitpunkt und Benutzer getrennt gehalten.
Keine zusätzlichen Akkordeons,
Ansichtsvarianten oder Historienmodale. Historien werden seitenweise mit jeweils
höchstens 50 Einträgen pro Quelle geladen; ältere Einträge sind nachladbar.
Trackingereignisse werden erst beim Öffnen dieses Reiters abgefragt und nicht
mit importierten Auftragsänderungen vermischt. Ereignis- und Erfassungszeit
bleiben getrennt erkennbar. Die operative Trackingansicht bleibt unverändert.

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

## Prüfung des veröffentlichten Grundstands

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

## Lokale Mailerweiterung vom 01.11.2026

Vollständiges ESLint und Produktionsbuild bestanden; nach den letzten Ergänzungen
gezieltes ESLint und Build erneut erfolgreich. Kein Backend-, Rules- oder
Shared-Vertrag geändert. Keine Veröffentlichung dieser Erweiterung.

Die isolierte Vorschau verwendet den echten Maildialog, Trackingeditor und die
Auftragsnavigation mit synthetischen Datenzugriffen. Vor den abschließenden
Ergänzungen erfolgreich bedient: 50 auf 53 Nachrichten nachladen, Mailwechsel,
Trackingentwurf über Schließen/Wiederöffnen und Fachreiterwechsel erhalten,
Speichern gegen den lokalen Ersatzdienst, Teilung per Tastatur, Hell/Dunkel und
DE/EN. Im letzten Stand zusätzlich dargestellt: gleich breite Inhalts-/Tracking-
Spalten, Leerzustand, Trackingladefehler mit Bearbeitungssperre und Leserechte.
Die abschließende Wiederholung aller Bedienaktionen bleibt offen: Die
Browsersteuerung übermittelte keine wirksamen Klicks mehr, auch bei einem
unabhängigen nativen Testbutton ohne React. Codeprüfung ergab dafür keinen
konkreten Anwendungsfehler. Fehler-Wiederholen, KI-Neustart/Prüfabschluss,
schmale Ansicht und bestehende Postfachdialoge sind daher noch im Browser
nachzuprüfen; echte Dev-Abnahme und serverseitige Schreibaktionen wurden für
diesen lokalen Umbau nicht ausgeführt.
