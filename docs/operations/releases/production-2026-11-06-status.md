# Vollständige Produktionsübernahme 06.11.2026

## Auftrag und Stand

Ausdrücklich freigegeben: vollständiger Dev-Stand einschließlich der zusätzlichen
Vertragsänderungen nach Main/Produktion; anschließend Dev auf denselben Stand.
Basis Main `a4b274d`, Dev `c0aa2ec`, zusätzliche Vertrags-Erweiterung `bb604d2`.
Zusammenführung auf `codex/release-all-2026-11-06`, Merge `eab0fc7`.

**Veröffentlichung noch in Arbeit.** Dieser Beleg wird mit den tatsächlich
erreichten Bereitstellungen und verbleibenden Grenzen ergänzt.

## Umfang und Korrekturen

Postfächer und Mailaktionen, Rechnungsprüfung, Maileinordnung/Qualität,
Sendungsverfolgung, Haftbarhaltung/DyCoS-Stationsadressen, Vertragsakten mit
Kalender/PDFs sowie zusätzlichem Zahlungsrhythmus, Bemerkung, Kostenkatalog und
prozentualer Kostenzuordnung. Neue freiwillige Sammlung tatsächlich versendeter
Antworten für manuelle Wissenspflege; standardmäßig aus, kein Altbestandsimport.

Der gemeinsame Emulatorlauf deckte einen konkurrierenden Transaktionsstart beim
Sammeln derselben Antwort und beim Umwandeln leerer Wissensgruppen auf.
Transaktionslesevorgänge beginnen jetzt mit einem gemeinsamen Batch beziehungsweise
werden nacheinander ausgeführt. Bestehende atomare Rechte-, Revisions- und
Dublettenprüfungen bleiben erhalten; technische Fehler werden nicht als Erfolg
umgedeutet und fachliche Konflikte nicht pauschal wiederholt.

## Aktuelle Prüfungen

- Saubere Installation der versionierten Frontend-/Functions-Abhängigkeiten.
- Build erfolgreich; vorhandener Hinweis auf große Bundles bleibt.
- Lint und Abgleich der 46 Shared-Module erfolgreich.
- 619 ausgewählte Unit-/Regressionsprüfungen erfolgreich, keine übersprungen.
- 13 komponentennahe UI-Prüfungen erfolgreich: Haftbarhaltung und Postfach-KI-
  Einstellungen, einschließlich Lernfreigabe.
- 71 Prüfungen im isolierten Firestore-/Storage-Emulator
  `demo-drehpunkt-release-all` erfolgreich, keine übersprungen. Darunter
  konkurrierende Lernfälle, leere Wissensgruppen, Vertragsrevisionen/PDFs,
  serverseitige Zugriffsgrenzen, Maileinordnung und Trackinghistorie.

Die zunächst fehlgeschlagenen Emulatorläufe sind keine bestandenen Prüfungen.
Das obige Ergebnis bezeichnet den erneuten vollständigen Lauf nach Korrektur.

## Betriebsanbindungen und Datenerhalt

Vorheriger Produktionsabgleich: Funktionspostfächer buchhaltung@, express@,
info@ und transport@ gaben HTTP 403 zurück; rechnung@ und no-reply@ HTTP 200;
persönliches bb@ wie vorgesehen HTTP 403. Die zusätzliche Produktionszuweisung
`Drehpunkt-Mail-Production-Functional-Read` wurde an den bereits vorhandenen,
inhaltlich exakt geprüften Scope `Drehpunkt-Mail-Functional-Read` gebunden.
Dieser umfasst ausschließlich die vier benannten UserMailbox-Adressen;
rechnung@ bleibt über den bisherigen SharedMailbox-Scope zugänglich. Nur
`Application Mail.Read`, kein Schreiben/Senden und kein unbeschränkter Grant.
Exchange bestätigt fünf positive und den persönlichen negativen Fall.
Tatsächliche Graph-Wirksamkeit und Webhooks sind gesondert zu prüfen.

Der allgemeine Einrichtungshilfe-Vergleich hat vorher wegen zusätzlich von
Exchange gesetzter OR-Klammerung korrekt angehalten. Vor der gezielten Bindung
wurden die vollständige tatsächliche Filterzeichenfolge, Filtervorschau,
bestehende Rollenzuweisungen und der negative persönliche Fall abgeglichen;
der Scope selbst wurde nicht verändert. Der Formatvergleich des Helfers bleibt
als separate Wartungsaufgabe offen.

Produktionsflow lieferte beim ersten lesenden Abruf noch kein
`stationAddresses`. Anpassung und anschließender Abrufnachweis stehen aus.
Produktionsnutzer, vorhandene Fach- und Vertragsdaten und vom Benutzer
bearbeitete Mailvorlagen werden erhalten. Keine Dev-Datenübernahme, keine
Bestandslöschung, keine rückwirkende KI-Auswertung und keine erforderliche
Datenmigration. Keine neuen Indexdefinitionen.

## Veröffentlichung

Backend/Rules vor dem neuen Produktionsfrontend bereitstellen. Firebase-Ziele
ausdrücklich `db-bpl-drehpunkt` und für den Dev-Abgleich
`db-bpl-drehpunkt-dev`. Firestore- und Storage-Regeln sind wegen Vertragsakten
beide erforderlich. Veränderte Functions einschließlich ihrer gemeinsamen
Abhängigkeiten und der Benutzerrechte-Registrierung berücksichtigen.

Noch zu ergänzen: veröffentlichte Commits, API-/Rules-Nachweise, Vercel-Status,
echte Browserprüfung und abschließender Main-/Dev-Abgleich.
