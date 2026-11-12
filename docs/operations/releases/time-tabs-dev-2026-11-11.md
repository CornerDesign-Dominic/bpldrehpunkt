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

## Darstellung nach Rückmeldung zur Dev-Ansicht

- Monatstabelle auf Tag, Sollzeit, Istzeit (erfasste Anwesenheit), Pause gesamt
  (gebucht plus automatischer Abzug), angerechnete Arbeitszeit und Plus/Minus
  reduziert. Keine Stempelereignisse, Korrekturknöpfe oder Hinweis-Spalten.
- Kompakte feste Breiten für Datum, Uhrzeit und Buchungsart im Einzeljournal.
- Gut sichtbare Text-/Farbkennzeichen für Original, manuellen Nachtrag,
  geändert und gelöscht; bei Änderungen bleibt der ursprüngliche Erfassungsweg
  sichtbar. Unklare historische Angaben werden nicht als Original ausgegeben.
- Speicherungen ohne geänderte Aktion oder Uhrzeit bleiben im vollständigen
  Verlauf enthalten und heißen ausdrücklich „Unverändert gespeichert“.
  Hauptspalten behalten dabei den tatsächlichen Buchungs-/Änderungsurheber.
- Verlauf über die gesamte Tabellenbreite statt in einer schmalen Einzelzelle,
  mit Vorher-/Nachher-Zeit einschließlich Sekunden und gespeichertem Grund.

Reine Web-Anpassung auf `dev`; kein neuer Backend-, Rules-, Handy- oder
Produktionsdeploy. Vollständiges ESLint, Web-Build, Abgleich der 48 gemeinsamen
Module und 26 gezielte Tests erfolgreich. Der ausgeführte React-/DOM-Test
prüft zusätzlich die sechs Monatsspalten und deren Zahlenwerte, die drei
Buchungskennzeichen, Erhalt unveränderter Speicherungen sowie den Verlauf
über neun Tabellenspalten. Keine neue angemeldete Browserabnahme behauptet.

## Kompakte Versionszeilen nach gemeinsamer Abstimmung

Auf erneuten ausdrücklichen Auftrag wird die normale Dev-Webseite über den
Branch `dev` angepasst. Die Zeitdarstellung wird separat vom zunächst nicht veröffentlichten lokalen
Fall-/To-do-Commit bearbeitet. Zwischenzeitlich bereits auf Dev veröffentlichte
Korrekturen werden bei der Übernahme erhalten; dieser Änderungscommit umfasst
ausschließlich die Zeitdarstellung und ihre Dokumentation/Tests.

- Acht gemeinsame Spalten für aktuellen Stand und aufklappbare Unterzeilen.
  Aktueller Stand oben, frühere Stände darunter absteigend bis zur ersten
  Erfassung. Keine Original-Kennzeichen, Statusabzeichen, Vorher-Spalte oder
  großflächigen Verlaufskästen.
- Schlichte Erfassungsart Gestempelt, Manueller Nachtrag oder Korrektur;
  geänderte Uhrzeit/Aktion gezielt hervorgehoben. Gelöschte Stände bleiben erhalten.
- Grund/Hinweis bei Bedarf je Stand; unveränderte Speicherungen getrennt von
  den effektiven Versionen einsehbar. 30 Stände erzeugen exakt 29 frühere Zeilen.
- Reine Web-Änderung; Firebase-Backend, Rules, mobile Anwendung und Produktion
  bleiben von dieser Bereitstellung unberührt.

Prüfung: vollständiges ESLint, Vite-Build, Abgleich der 48 gemeinsamen Module,
27 gezielte Node-Tests sowie React-/DOM-Oberflächenprüfung einschließlich
30-Versionen-Fall, acht Zellen pro Unterzeile, Reihenfolge, Ein-/Ausklappen,
Urheberzuordnung, getrennten Speicherungen und Grund/Hinweis.
Die angemeldete Live-Browserabnahme wird damit nicht vorweggenommen.

## Ergänzung 12.11.2026: Bearbeiter, Grund und Unterzeilen

- Bearbeiter-Spalte auf 150 Pixel begrenzt; neue eigene Grund-Spalte übernimmt
  den frei werdenden Platz. Gründe sind direkt lesbar, zusätzliche Hinweise
  bleiben bei Bedarf aufklappbar.
- Hauptzeilen, frühere Stände und unveränderte Speicherungen besitzen dieselben
  neun Spalten. Verlauf enthält ausschließlich die Verlaufsschalter.
- Frühere Stände und Speicherungen erhalten einen deutlich abgesetzten
  Zellhintergrund, im dunklen Theme heller und im hellen Theme dunkler;
  auch beim Überfahren mit der Maus bleibt die Abgrenzung erhalten.
- Ausschließlich Dev-Webdarstellung; keine Backend-, Handy- oder Produktionsänderung.

React-/DOM-Prüfung: eigene Grund-Spalte, neun ausgerichtete Zellen in allen
30 Versionszeilen sowie unverändertes Ein-/Ausklappen und Zuordnung der
Hinweise. Vollständiges ESLint und Web-Build gehören zur Veröffentlichungsprüfung.
