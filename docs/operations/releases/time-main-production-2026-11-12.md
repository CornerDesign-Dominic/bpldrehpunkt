# Meine Arbeitszeit: gezielte Produktionsübernahme 12.11.2026

## Auftrag und Abgrenzung

Ausdrücklich beauftragt: normalen Kartenrahmen/-hintergrund und keinen
zusätzlichen Pausenhinweis verwenden, deutlichen Status und Pause-beenden-Button
behalten; anschließend den vollständigen Dev-Umfang des Moduls Meine Arbeitszeit
nach Main/Produktion übernehmen. Quelle Dev `780ff2f`, Grundlage Main `4442690`.

Der Release wird separat ab Main zusammengestellt. Er übernimmt ausschließlich
Zeitoberfläche, Einzelbuchungseditor, Wochenbalken/-navigation, Monatsübersicht,
Journal/Versionshistorie/Datumsfilter/50er-Seiten, Handy-Einstiegsdialog und die
benötigten Zeit-Backend-/Indexergänzungen einschließlich Tests/Dokumentation.
Keine Wissens-, To-do-, Erinnerungs-, Fall- oder allgemeinen Rules-Änderungen.
Keine Änderungen an Nutzern, Zeitkonten, Modellen oder vorhandenen Buchungen.
Keine neue mobile App oder mobile Hosting-Bereitstellung.

## Zugriffsprüfung und Backendumfang

Die vorhandenen Zeitfunctions sind in Produktion aktiv. Neu benötigt wird
listOwnTimeBookings; zusätzlich werden listTimeWorkspace, stampTime und
correctTimeDay gezielt mit dem aktuellen Zeitquellstand veröffentlicht.
Die bestehende Main-Fassung enthält bereits die separat geprüften eigenen
Leserechte, eigenständige Managerzuständigkeit und Sieben-Tage-Fristen.

Die neue Abfrage erfordert aktives Profil und eigenes Zeit-Leserecht; Ziel ist
immer die authentifizierte UID. Fremde Ziel-IDs werden nicht übernommen.
Ausgabe eigener Ereignisse/Verläufe ohne Modelle/HR-Profile. App Check bleibt
aktiv. Direkte Browserrechte auf Zeitcollections werden nicht ergänzt.

Der zusätzliche Index timeDays: userId ASC, date DESC wird ausschließlich im
Produktionsprojekt db-bpl-drehpunkt additiv angelegt. Keine anderen Indizes
löschen oder ersetzen, kein Rules-/Storage-Deploy. Vorhandene vier öffentliche
MAILBOX-Analyseparameter werden aus der bestehenden Produktionsfunktion gelesen;
keine Dev-Parameter oder Secrets in Produktion übernehmen.

## Tatsächlich ausgeführte Prüfungen

- Vollständiges ESLint, Vite-Build und Abgleich der 48 Shared-Module erfolgreich.
- 59 gezielte Node-Tests erfolgreich, keine Fehler oder übersprungenen Tests.
- React-/DOM-Prüfungen für Einzeländerung/Nachtrag/Löschung, Konflikt-/Fehlerfälle,
  Pflichtgründe, Wochen-/Monatsansichten, Navigation, Status/Pausenende, echten
  Handy-Dialog, Journal mit 30 Ständen, 50er-Seiten und Von/Bis-Suche erfolgreich.
- 17 Emulatorprüfungen auf demo-drehpunkt-time erfolgreich, keine übersprungen.
  Enthalten Rechte-/Zeitkonto-/Pausen-/Korrekturabläufe, unangemeldete und inaktive
  Konten, fremde Mitarbeiter/Abteilungen, reine Leserechte, private Modelle,
  direkte Rules-Zugriffe und gezielter Fremd-ID-Versuch am neuen Journal.
- Keine angemeldeten Live-Testbuchungen oder Produktions-Testkonten erzeugt.
  Die fachliche Prüfung mit realem Nutzer wird nicht durch Emulatorprüfungen ersetzt.

Der veröffentlichte Stand und die Cloud-Prüfergebnisse werden nach der
gezielten Bereitstellung ergänzt. Produktive PWA-Zieladressen werden nicht aus
Dev kopiert; ein bestehender produktiver Handy-Link bleibt von der jeweiligen
Production-Konfiguration abhängig.

Die bestehende Produktionsseite wurde vor der Freigabe lesend geprüft: HTTP 200,
Firebase-Projekt db-bpl-drehpunkt und vorhandener Handy-Link
https://db-bpl-drehpunkt-time.web.app. Dieser Link wird beibehalten. Die zwei
exakten Produktions-Hosting-Origins werden zusätzlich als mobile Herkunft erkannt;
keine neue PWA-Version oder Hosting-Veröffentlichung erforderlich. Fremde ähnlich
benannte Domains bleiben unbekannt. Entsprechende Node-Prüfungen ergänzt.

## Rückgelesene Produktionsbereitstellung

Vier gezielte Functions in europe-west3 als ACTIVE/nodejs22 bestätigt:

- listOwnTimeBookings: listowntimebookings-00001-qoc.
- listTimeWorkspace: listtimeworkspace-00002-pol.
- stampTime: stamptime-00003-baq.
- correctTimeDay: correcttimeday-00003-joq.

Index timeDays: userId ASC, date DESC, Kennung CICAgPi9lIEK, READY.
Tagesabfrage mit Sortierung/Limit und Historienabfrage mit 30 Datumswerten liefern
HTTP 200 bei rein lesender Probe auf eine nicht vorhandene Probe-UID.
Unangemeldeter Aufruf von listOwnTimeBookings: HTTP 401 UNAUTHENTICATED.
Vorher-/Nachher-Vergleich aller Produktionsfunctions bestätigt keine Änderungen
an anderen Funktionen. Keine Produktions-Testdaten geschrieben.

Das Frontend wird erst nach diesen Backend-/Indexnachweisen gezielt nach Main
gepusht. Die Vercel-Prüfung am Releasecommit bildet den Frontend-Deploynachweis;
anschließend wird die tatsächliche Produktionsseite einschließlich öffentlicher
Firebase-Zuordnung und Pausendarstellung lesend kontrolliert.

Der origin/main-Verweis war aufgrund der auf dev beschränkten Fetch-Konfiguration
zunächst veraltet. Main wurde ausdrücklich aus dem Remote geladen; der erste
nicht schnelle Push wurde abgewiesen und änderte Main nicht. Der Release wurde
auf die tatsächlich bereits veröffentlichte Grundlage 4442690 neu gesetzt.
Die bestehenden Fall-/To-do-Rechtekorrekturen sind damit erhalten und nicht als
neuer Dev-Umfang übernommen. Die Zeit-Produktionsfunctions unterscheiden sich
im tatsächlich verwendeten Zeit-/Access-/Shared-Code nicht durch diese Neubasis.
