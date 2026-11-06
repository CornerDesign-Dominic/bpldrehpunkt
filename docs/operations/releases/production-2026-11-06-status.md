# Vollständige Produktionsübernahme 06.11.2026

## Auftrag und Stand

Ausdrücklich freigegeben: vollständiger Dev-Stand einschließlich der zusätzlichen
Vertragsänderungen nach Main/Produktion; anschließend Dev auf denselben Stand.
Basis Main `a4b274d`, Dev `c0aa2ec`, zusätzliche Vertrags-Erweiterung `bb604d2`.
Zusammenführung auf `codex/release-all-2026-11-06`, Merge `eab0fc7`.

Backend und Regeln sind in Produktion und Dev bereitgestellt und direkt
zurückgelesen. Frontend-Übernahme erfolgt über
[Pull Request 4](https://github.com/CornerDesign-Dominic/bpldrehpunkt/pull/4).
Der aktuelle Merge-/Build-Abschluss ist dort nachvollziehbar.

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
- Drei zusätzliche Prüfungen des Regelgenerators: Zeichenketten und Escapes,
  Kommentar-/Operatorgrenzen, Pfadsubstitutionen, Idempotenz und unveränderte
  Nichtkommentarzeichen der vollständigen Regeln.

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

Der bestehende Produktionsflow wurde gezielt um die zwei geprüften
Leseoperationen für Stationsreferenzen und Adressstamm ergänzt. Bisherige
authentifizierte HTTP-Adresse und Produktionsidentität bleiben erhalten;
keine Dev-URL oder Dev-Secrets übernommen. Numerische Referenzen, keine
unbeschränkte Stammdatenabfrage: maximal 2.000 Zeilen, nur
`ID,Firma,Strasse,PLZ,Ort,Land`, bei leerer Stationsliste `ID eq 0`.
Die vorhandene Antwort wird um `stationAddresses` ergänzt. Flowprüfung ohne
Fehler/Warnungen, Veröffentlichung bestätigt, anschließender lesender
Produktionsabruf TA `261000124` erfolgreich mit einer Stationsadresse.
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

Quellstand der Functions: `8fca7bd`. In Produktion 116 benötigte neue/geänderte
Exporte einschließlich Abhängigkeiten und Benutzerverwaltung aktiv;
Dev-Ergänzung: `mutateContract`, `saveContractCostCategory`,
`processMailboxLearningRun`, `manageEmptyKnowledgeGroup` aktiv. Die tatsächlichen
Source-Archive aller 116 beziehungsweise vier Exporte haben denselben MD5
`PBtsE/m0kNP3XWGP0NonLA==`. Google-Limits für Mutationen führten zwischenzeitlich
zu HTTP 429; der Functions-Deploy wurde anschließend erfolgreich abgeschlossen
und alle Ziel-Exporte direkt verifiziert. Keine fehlgeschlagene Zwischenmeldung
wird als abgeschlossene Bereitstellung gewertet.

Aktive Firestore-/Storage-Regeln nach Rücklesen fachlich identisch mit dem
Release-Quellstand in beiden Projekten. Produktions-Firestore-Ruleset
`61abcf4d-fc41-4ec2-8c3c-a97548025874`, Produktions-Storage-Ruleset
`b8797c9f-3eff-47a1-8f4e-c07723bfe0b4`; Dev-Firestore
`787868bf-b394-4ba7-bc36-006690de815f`, Dev-Storage
`57d560a7-2ec7-42f1-beaa-b8b83da99d9f`.
Wegen Cloud-Compilerfehlern wurden nur für Firestore kompakte Regeln mit
unveränderten fachlichen Tokens veröffentlicht. Zwei Typwarnungen verbleiben;
keine Regel oder Zugriffsgrenze wurde deshalb gelockert.

Dev-Frontend `8fca7bd`: Vercel erfolgreich. Echte Browserabnahme mit vorhandenem
Dev-Benutzer: eigene Testakte angelegt, monatlicher Zahlungsrhythmus ab
31.01.2026 gespeichert (nächster Zahlungstag 30.11.2026), Bemerkung gespeichert,
eigene Kostenposition angelegt; 90-%-Zuordnung abgewiesen, 100 % gespeichert.
Neuladen und serverseitiges Rücklesen bestätigen die Werte. Anschließend wurden
ausschließlich die exakt identifizierte eigene Testakte, eigene Testkostenposition
und deren technische Untereinträge entfernt. Bestehende Vertragsdaten bleiben.
TA `261000124` regulär in der Haftbarhaltung gesucht und ausgewählt: Formular
und Vorschau zeigen LGH Hamburg, Bredowstr. 10, 22113 Hamburg.
Postfachliste und neue Vertragsbereiche ohne Browser-Konsolenfehler geöffnet.

Produktive Fachbelege wurden für diese technische Abnahme nicht angelegt und
keine Testmail versendet. Ein neuer tatsächlicher SentItems-Lernfall sowie echte
neue Statusantworten wurden in diesem Release nicht durch Versand ausgelöst;
diese Fälle sind durch die automatisierten Prüfungen abgedeckt, nicht durch
einen neuen realen Mailwechsel. Abschließender Main-/Dev-Abgleich und
Produktionsfrontend-Abnahme werden im PR-Abschluss festgehalten.

Offene Betriebsgrenze: Zum Graph-Nachtest am 06.11.2026 um 13:25 UTC antworten
die vier ergänzten UserMailbox-Adressen noch mit HTTP 403; rechnung@ und
no-reply@ mit HTTP 200, persönliches bb@ wie vorgesehen mit HTTP 403.
Die Microsoft-Wirksamkeit der zusätzlichen Freigabe bleibt damit offen;
keine vollständige Ende-zu-Ende-Bestätigung dieser vier Application-Zugriffe.
Vorhandene Produktions-Automatikeinstellungen und delegierte Verbindungen
werden nicht durch einen pauschalen Grant oder eine automatische Neuanmeldung
ersetzt. Empfehlungen und manuelle Postfachbearbeitung bleiben getrennte Abläufe.
