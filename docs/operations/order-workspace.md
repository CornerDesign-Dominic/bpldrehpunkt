# Auftragsbereich und Sendungsverfolgung

Stand: 01.11.2026. Entwicklung auf `codex/order-workspace`, ausgehend vom
veröffentlichten Auftragsstand `0f9ca77`, zusammengeführt mit Dev `0b27039`.
Der Nutzer hat die gesammelten Trackingbereinigungen, den breiten Stationsablauf,
die Fixtermin-Übernahme, die zweispaltige Geschäftspartneransicht und den
Mailreiter ausdrücklich zur Veröffentlichung ausschließlich auf Dev freigegeben.
Durchführung und aktueller Status stehen im
[Dev-Release vom 01.11.2026](releases/order-workspace-dev-2026-11-01-status.md).
[Frühere Releases und echte Abnahmen](order-workspace-dev-release.md).
Main und Produktion bleiben unverändert.

Nach diesem Dev-Release ist eine weitere lokale Überarbeitung umgesetzt:
Die Reiter heißen „Auftrag“ und „Kunde & UTN“; die Auftragsansicht betont
Fahrzeug/allgemeine Hinweise und zusätzliche DyCoS-Transportdaten. Stationen
nutzen einzelne Karten für Adresse, Termin, Referenz, Waren, Palettentausch und
Bemerkung.
Dieser Folgestand ist nach ausdrücklicher Nutzerfreigabe für Dev vorbereitet;
Bereitstellung und Nachweise stehen im [Karten-Release](releases/order-station-cards-dev-2026-11-01-status.md).

## Benutzerablauf

In Übersicht, Auftrag, Kunde & UTN sowie Finanzen stehen der letzte bestätigte
Aktualisierungszeitpunkt und die Aktion „Aktualisieren“ rechts in der gemeinsamen
Reiterleiste. Der Zeitpunkt ist reiner Text ohne Link; die Aktion ist optisch
wie ein Reiter gestaltet, bleibt semantisch ein Button und wechselt keine Seite.
Die zusätzliche Werkzeugzeile unter der Navigation entfällt. Bestehende
Aktualisierungsbereiche und Bearbeitungsrechte bleiben erhalten; während des
Abrufs ist die Aktion gesperrt. Details zu Versuchen bleiben in der Historie.
Bei schmalen Fenstern darf die Reiterleiste umbrechen. Historie behält ihren
eigenen Ablauf. Im Trackingreiter steht der bisherige Auftragsabruf ebenfalls
rechts in dieser Leiste, einschließlich nicht interaktivem Importzeitpunkt;
sein bestehender Abruf, Wiederholschutz und Fehlerrückmeldung bleiben erhalten.

Die linke Aktionsspalte der Sendungsverfolgung entfällt. Rechnungsprüfung ist
weiter in Finanzen verfügbar; Fälle, Palettenbewegungen und To-dos in Übersicht.
Direkt vor dem Zeitstrahl stehen Strecke und die Trackingaktionen kompakt
nebeneinander. Streckenwert, Fahrzeitschätzung, Neuberechnung, Fehler- und
Adressklärungsdialog bleiben erhalten. Pausieren/Fortführen und Abschließen
verwenden dieselben Bestätigungsdialoge, Rechte, Sperren und serverseitigen
Aktionen wie zuvor. Schmale Ansichten stellen diese beiden Bereiche untereinander.

`/transportauftraege` führt zur Auftragsliste, `/sendungsverfolgung` zur
operativen Verfolgungsliste. Beide öffnen dieselbe Auftragsakte unter
`/transportauftraege/:transportOrderId`: Aufträge starten mit Übersicht,
Verfolgungen mit `?tab=tracking`. Bisherige Trackingdetailadressen leiten unter
Erhalt von Anfrageparametern, Hash und Rückkehrzustand auf diesen Reiter weiter.

Die Auftragsliste verwendet dieselben Tabellenrahmen, Sortieranzeigen und
Seitennavigationsstile wie die Sendungsverfolgungsliste. Beide Listen nutzen
die gesamte verfügbare Inhaltsbreite; die üblichen Seitenabstände bleiben
erhalten. Die jeweils vorhandenen Spalten, Filter, Sortier- und Seitenabläufe
bleiben unverändert. Einzel- und Sammelimport stehen rechts zusammen als
gleichfarbige, ungefüllte Buttons.

In den bestehenden Auftragsspalten „Laden“ und „Entladen“ erscheinen unter
dem Ort beide bestätigten Zeitgrenzen, beispielsweise `02.11. · 08:00–20:00 Uhr`.
Fehlt eine Grenze, steht ausdrücklich „ab“ oder „bis“; bei Tageswechsel werden
beide Daten genannt. Dafür werden ausschließlich vorhandene Auftragsdaten
verwendet, ohne zusätzliche Abfragen oder neue Tabellenspalten. Diese gesammelten
Listenanpassungen wurden vom Nutzer zur Veröffentlichung auf Dev freigegeben.

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
mit Verknüpfungen. Reihenfolge: Übersicht, Auftrag, Sendungsverfolgung, Kunde & UTN,
Finanzen, Zugeordnete Mails, Historie. Zugeordnete Mails öffnet weiterhin einen Dialog.
Tatsächlich übermittelte Stationen bleiben vollständig
erhalten. Alte CSV-Daten können erste/letzte Station liefern; fehlende Warenmaße,
Finanzwerte oder Belege werden nicht erfunden. Das Auftragsergebnis ist die
Differenz der übermittelten Nettoerträge und Nettokosten, kein zusätzlicher
buchhalterischer Abschlussstatus.

Geschäftspartner nutzt lokal die gesamte Inhaltsbreite ohne Verknüpfungsspalte:
Kunde links und Unternehmer rechts in zwei gleich breiten Spalten. Die
zusätzliche Karte „Auftragsbezogene Angaben“ entfällt in diesem Reiter.
Stammdatenverknüpfungen, Kontakte und Aktualisierungsaktion bleiben verfügbar;
bei schmalen Ansichten stehen die Partnerkarten untereinander.

Der lokal überarbeitete Reiter „Auftrag“ nutzt die volle Inhaltsbreite ohne
rechte Verknüpfungsspalte. Die allgemeinen Auftragsdaten oben nutzen dieselbe
Abschnittsfarbe und Feldtypografie wie die Stationen, ohne verschachtelte
Innenrahmen. Fahrzeugtyp und vorhandene Kennzeichen stehen neben den
vollständigen allgemeinen Dispositionshinweisen und Wareninformationen.
Tour und übermittelte Auftragsmengen bleiben getrennt erkennbar. Fehlende
allgemeine Hinweise werden als fehlend angezeigt.

Alle Stationen bleiben untereinander und werden durch dezente horizontale Linien
getrennt. Je Station gibt es zwei Karten in Farben, Schrift und Abständen der
Sendungsverfolgung: links Stationstitel, Adresse, Termin und Referenz; rechts
unter „Hinweis & Ware“ Bemerkung, Warenbeschreibung, Mengen, Palettentausch und eine vorhandene
Lieferscheinnummer. Die Felder haben keine zusätzlichen neutralen Kartenrahmen.
Eine besondere Hervorhebung begrenzt sich weiterhin auf das betroffene Feld
Adresse, Termin oder Palettentausch. Die Referenz bleibt auch mit Inhalt neutral.
Datum und Uhrzeit verwenden dieselbe Schriftgröße und -stärke; FIX bleibt hinter
der Uhrzeit. Schmale Ansichten stellen die Bereiche untereinander.

Die Terminkarte ist ausschließlich bei `fixedAppointment === true` mit gelbem
Rand und linkem Streifen markiert; ihre Fläche bleibt neutral. Ein bestätigter
Fixtermin erscheint als „ - FIX“ direkt nach der Uhrzeit. FIX erbt dieselbe
Schrift, Größe und Stärke wie die Uhrzeit; allein die Farbe ist gelb. Eine
separate Fixtermin-Ja/Nein-Zeile entfällt. Fehlendes FIX ist keine bestätigte
Aussage, dass der unbekannte Quellwert false wäre. Das einzelne Wort FIX in
einer Stationsbemerkung wird ebenfalls gelb dargestellt (Groß-/Kleinschreibung
bleibt erhalten). Diese reine Textformatierung setzt kein Fixtermin-Kennzeichen
und verändert keine Daten oder Terminrahmen. Die Adresskarte
ist ausschließlich bei einem erkannten ausdrücklichen Hinweis auf neutrale
Abholung beziehungsweise Anlieferung am Rand und linken Streifen gelb markiert
und nennt diesen Grund. Palettentausch true markiert Rand und linken Streifen
des Feldes sowie das Wort „Ja“ gelb; false/unbekannt bleiben neutral. Die
Darstellung prüft Stationsbemerkung und allgemeine Dispositionsbemerkung auf
explizite deutsche Formulierungen; bloße Referenzen und andere Texte werden
nicht durchsucht. Eigene Stationsangaben haben Vorrang vor allgemeinen
Angaben. Verneinungen und Gegenformulierungen werden berücksichtigt; ein
isoliertes „NEUTRAL“ im Stationshinweis gilt für diese Station, im allgemeinen
Hinweis ohne benannte Tätigkeit dagegen nicht. Dies ist eine begrenzte
regelbasierte Anzeige, kein vollständiges Sprachverständnis und kein
persistierter Tracking-/Adressstatus. Die Originalhinweise bleiben sichtbar.

Gewicht, Kolli und Lademeter stehen je Station im eigenen Warenblock. Tatsächliche
Nullwerte bleiben sichtbar; fehlende Stationswerte werden nicht aus dem Auftrag
ersetzt. Die Stations-Warenbeschreibung und ein eigenes Volumengewicht laut
DyCoS sind ergänzt. Volumengewicht ersetzt weder tatsächliches Gewicht noch
Auftragstotal und nennt die fehlende Berechnungsgrundlage. Mehrzeilige Hinweise
mit Maßangaben bleiben vollständig in der Bemerkung. Das Feld `Masse` ist noch
nicht als strukturierte Abmessung bestätigt; es werden keine Einheiten ergänzt
oder Werte aus Texten herausgerechnet. Die Übersicht behält ihre kompakte
Stationsdarstellung. Mehrtägige Fenster behalten beide Daten, fehlende Zeitgrenzen
werden nicht ergänzt.
Lokal ergänzt ist die Übernahme von `LadeEntladestellen2.Fixtermin` über
`LadeEntladestellenID` nach `stops[].fixedAppointment` sowie in die Projektionen
`loading.fixedAppointment` und `unloading.fixedAppointment`. Bestätigte Werte
werden als boolean gespeichert und wie oben beschrieben dargestellt; 0/1 werden an der
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
automatischer Massenimport. Der aktuelle Dev-Veröffentlichungsnachweis steht im oben verlinkten Releasebeleg.

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
Shared-Vertrag geändert. Diese Prüfung erfolgte vor der anschließenden Dev-Freigabe.

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

## Lokale Hervorhebung der Auftragsdaten nach dem Dev-Release

Die Folgeänderung mit den Reiterbezeichnungen „Auftrag“ und „Kunde & UTN“
sowie den neuen Darstellungsbausteinen war zum Zeitpunkt dieser lokalen Prüfung noch nicht veröffentlicht.
Vollständiges ESLint, Produktionsbuild und fünf vorhandene Prüfungen der
Stations-/Workspace-Darstellung erfolgreich. Die isolierte Browserprüfung
verwendet synthetische Daten mit echten Komponenten: deutlicher FIX-Badge,
explizites false/unbekannt, echte Nullwerte, mehrtägiges Zeitfenster, fehlende
Adresse, vollständige mehrzeilige Maß-/Ladehinweise und leere Stationsliste.
Hell/Dunkel und Deutsch/Englisch geprüft. Ein isolierter 560-Pixel-Rahmen
bestätigt den einspaltigen Umbruch ohne horizontales Überlaufen. Keine neuen
Browserfehler in den geprüften Ansichten. Datenimport, Berechtigungen und
Backend unverändert; keine echte Dev-Datenänderung oder Veröffentlichung.

## Lokale Karten- und Transportdatenerweiterung nach der Hervorhebung

Warenbeschreibung des Auftrags/je Station, Gefahrgutkennzeichen, Fahrzeughinweise
und getrennte DyCoS-Distanzen für Auftrag/Tour sind zusätzlich gemappt und in der
Auftragsansicht sichtbar. Das Routingkennzeichen und ein erklärender Hinweis
verhindern die Gleichsetzung dieser Quellenwerte mit tatsächlich gefahrenen
Kilometern oder der gesonderten Drehpunkt-Routenberechnung. Tourwerte können
mehrere Aufträge umfassen. Gefahrgut bleibt boolean/null, ohne Ableitung weiterer
ADR-Angaben. Alle neuen Felder werden historisiert; Nullergänzungen erzeugen
keine Scheinänderungen an Altstationen, echte 0/false bleiben nachvollziehbar.
Feldquellen, Stichprobe und verbleibende Unklarheiten stehen in der
[DyCoS-Feldklärung](../reference/dycos-feldklaerung-2026-10-31.md#lokale-ergänzung-transportdaten-und-stationskarten-am-01112026).

Diese Folgeänderungen waren zunächst ausschließlich lokal. Die anschließende
ausdrückliche Dev-Freigabe und Bereitstellung stehen im oben verlinkten Karten-Release. Für eine spätere
Dev-Veröffentlichung sind Frontend und die beiden importierenden Functions
`fetchDycosTransportOrder` und `refreshTransportOrderWorkspace` zu betrachten.
Die Rechnungsprüfung verwendet den Mapper ebenfalls lesend, wertet die neuen
Transportdetails jedoch nicht aus und persistiert sie nicht. Keine neuen
Firestore-/Storage-Rechte oder Indizes, kein zusätzlicher Flow-Aufruf und keine
neue Berechnung oder automatische Massenaktualisierung. Bestehende Aufträge
bekommen die optionalen Zusatzdaten beim nächsten Abruf nach einem späteren
Backend-Rollout.

Prüfung dieser lokalen Karten-/Datenerweiterung: 71 gezielte Backendprüfungen
und 30 echte Emulatorprüfungen erfolgreich, keine übersprungen; ausschließlich
`demo-drehpunkt-order-fields`, danach beendet. Alle 19 bereits vorhandenen
Exportantworten im Speicher mit dem erweiterten Mapper fehlerfrei verarbeitet.
16 Client-/Darstellungsprüfungen erfolgreich, einschließlich expliziter neutraler
Anweisungen, Verneinungen, Stationsvorrang und Trennung von Referenzen/Fixtermin.
Vollständiges ESLint, Build und 45-Module-Shared-Abgleich berücksichtigt.
Browserprüfung mit synthetischen Daten: getrennte gelbe Adress-/Terminkarten,
immer neutrale Referenz, kein großer FIX-Badge, identische Größe/Stärke von
Datum/Uhrzeit, neue Quellfelder, Nullwerte und Volumengewicht separat sichtbar.
Hell/Dunkel und Deutsch/Englisch; 560-Pixel-Rahmen ohne horizontalen Überlauf.
Bei dieser lokalen Prüfung wurden keine echten Fachdaten verändert und noch keine Veröffentlichung durchgeführt.

## Verdichtete Karten nach der Dev-Abnahme am 01.11.2026

Die bisherige Kartenansicht wurde auf Nutzerfeedback kompakter gesetzt:
kleinere Innen-/Zwischenabstände, zurückhaltendere Überschriften und Werte.
Datum/Uhrzeit stehen bei ausreichender Breite nebeneinander und bleiben
identisch gewichtet; FIX erbt weiter die Uhrzeitschrift. Referenz und
Palettentausch stehen jeweils in einer eigenen schmalen Karte mit Titel/Wert
nebeneinander. Allgemeine Daten nutzen abhängig von der Inhaltsbreite drei oder
vier Karten nebeneinander und eine kompakte Zeile für Auftragsmengen.
Alle Daten, vollständigen Hinweise und bestehenden Randmarkierungen bleiben
erhalten. Bei schmalen Ansichten umbrechen die Angaben ohne Abschneiden.

Vergleich mit identischen synthetischen Daten im selben 1280-Pixel-Prüfviewport:
Kopfbereich 338 auf 181 Pixel, Stationen 425/442 auf 261/273 Pixel. Dies ist ein
konkreter Layoutnachweis für die geprüften Daten, kein fester Höhenvertrag für
lange reale Inhalte. Browserprüfung mit langen Hinweisen, Kilometerdaten,
Hervorhebungen, Hell/Dunkel und 560-Pixel-Rahmen berücksichtigt. Diese Anpassung
ändert ausschließlich die Oberfläche; kein weiterer Backend-/Rules-/Indexdeploy.
Die Dev-Veröffentlichung folgt dem zuvor ausdrücklich freigegebenen Rahmen,
Main und Produktion bleiben unverändert. Nachweis im Karten-Releasebeleg.
