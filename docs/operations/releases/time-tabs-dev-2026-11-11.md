# Eigene Arbeitszeit: Fachreiter auf Dev, 11.11.2026

## Umfang

- Unter dem unverändert verfügbaren heutigen Stempelbereich: Aktuelle Woche
  (Standard), Monatsübersicht und Alle Buchungen.
- Wochenansicht Montag bis Sonntag; Monatstabelle mit Monatswahl.
  Auch bei historischer Monatswahl bleiben heutiger Status und Wochenwerte aktuell.
- Alle Buchungen: eine Zeile pro Ereignis-ID, unabhängig von der Monatswahl,
  nachladbar in Seiten mit 30 gespeicherten Tagen. Gelöschte Ereignisse bleiben
  sichtbar. Herkunft, Erfassungsart, Vorher-Wert, Bearbeiter und Zeitpunkt sowie
  vollständiger aufklappbarer Einzelverlauf einschließlich Grund und Hinweis.
- Neue Web-Ereignisse speichern `client: web`. Vorhandene mobile Dev-Versionen
  werden anhand ihrer exakten Hosting-Origins erkannt. Historisch fehlende
  Geräteangaben bleiben ausdrücklich nicht erfasst. Keine Datenmigration.
- Keine Änderungen am mobilen Repository oder mobilen Hosting.
  Zeitmanageransicht und Zeitberechnung bleiben fachlich unverändert.

## Bereitstellung

Ziel ausschließlich `db-bpl-drehpunkt-dev`. Separater temporärer Checkout auf
Basis `197a0e0` mit ausschließlich den Zeitänderungen; parallel bearbeitete
Fallmodule und deren Rechteänderungen wurden nicht mit veröffentlicht.
Kein Push, Merge oder Produktionsdeploy.

Web: https://db-bpl-drehpunkt-dev-web-time.web.app/zeiterfassung

Build-Zuordnung: `db-bpl-drehpunkt-dev`, erstellt am
`2026-11-11T11:22:14.172Z`. Seite und Build-Zuordnung HTTP 200, HTML mit
`no-cache, no-store, must-revalidate`.

Gezielt veröffentlichte Functions in `europe-west3`, jeweils aus der Cloud als
`ACTIVE`, `nodejs22` zurückgelesen:

- `listOwnTimeBookings`: `listowntimebookings-00001-neb` (neu).
- `stampTime`: `stamptime-00002-mab` (Herkunft/Bearbeiter ergänzen).
- `correctTimeDay`: `correcttimeday-00002-haj` (Herkunft/Bearbeiter ergänzen).

Vorhandene vier öffentliche `MAILBOX_*`-Parameter ausschließlich aus der
bestehenden Dev-Function übernommen, damit die gemeinsame Quellanalyse läuft.
Keine Mailfunktion oder Secret-Änderung veröffentlicht.

Index `timeDays: userId ASC, date DESC`, Kennung `CICAgJiljJcK`, additiv
angelegt und nach Aufbau als `READY` bestätigt. Auch die tatsächliche
Tagesabfrage mit Nutzerfilter, Datum absteigend und Limit 31 liefert nach der
Index-Propagation HTTP 200. Bestehende Rules, Storage-Regeln und andere Indizes
nicht verändert.

## Prüfungen

- Vollständiges ESLint erfolgreich, auch im isolierten Release-Checkout.
- Abgesicherter Dev-Web-Build erfolgreich; bestehender Bundlegrößenhinweis.
- 48 gezielte Node-Tests für Zeitberechnung, Persistenz, Rechte, Herkunft,
  Buchungsverlauf, Vorlagen und Dashboard erfolgreich.
- Vier Tests des angepassten Dev-Deployplans erfolgreich.
- 48 gemeinsame Deploymodule unverändert abgeglichen.
- Ausgeführter React-/DOM-Oberflächentest: Standardwoche mit sieben Tagen,
  Monatsansicht, Einzelbuchungen, Tastaturwechsel, ausschließlich eigene Daten,
  monatsübergreifendes Nachladen, Fehler/Wiederholen ohne doppelte Zeilen und
  Löschhistorie erfolgreich. Ausführung: `node scripts/test-time-ui.mjs`.
- Nicht angemeldeter Aufruf von `listOwnTimeBookings`: HTTP 401,
  `UNAUTHENTICATED`, keine Datenübertragung.
- Historienabfrage mit Nutzerfilter und 30 Datumswerten als ausschließlich
  lesende Cloud-Probe mit nicht vorhandenem Probe-UID erfolgreich.

Keine neue angemeldete Browserabnahme oder Emulatorprüfung behauptet.
Für die Prüfung wurden keine Zeitbuchungen, Korrekturen oder Benutzer angelegt.

## Übernahme auf die normale Dev-Seite

Auf ausdrücklichen Folgeauftrag werden die Zeitänderungen zusätzlich über den
bestehenden Git-/Vercel-Weg des Branches `dev` veröffentlicht. Grundlage ist der
aktuelle Dev-Stand `3b16962` einschließlich der nachträglichen Rechtekorrekturen;
diese werden beim Zusammenführen erhalten. Ziel der bestehenden Dev-Zuordnung:
https://dev.drehpunktlogistik.de/zeiterfassung.

Die im Folgeauftrag genannte Schreibweise `dev.brennpunktlogistik.de` hatte bei
der Prüfung keinen DNS-Eintrag; die dokumentierte und auf Vercel auflösbare
normale Dev-Domain ist `dev.drehpunktlogistik.de`. Es wird keine neue Domain
angelegt. Die Produktionshauptbranche, das Firebase-Produktionsprojekt und das
mobile Repository/Hosting sind keine Ziele dieser Frontend-Veröffentlichung.
Die bereits bereitgestellten Zeit-Functions und der Index werden dafür nicht
erneut veröffentlicht.
