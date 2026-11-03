# Rechnungsprüfung – Release 03.11.2026

## Freigabe und Umfang

Der Nutzer hat am 03.11.2026 die besprochenen Verbesserungen und das Pushen nach
`dev` und `main` ausdrücklich beauftragt. Isolierte Umsetzung ab `484427f`;
die ungesicherten Änderungen im Desktop-Arbeitsverzeichnis wurden nicht übernommen.

- Rechnungserkennung mit Seitenbezug; PDFs und statische Bildanhänge, gemeinsame
  TA-Hinweise aus Begleitdokumenten und serverseitig gelesenem Betreff/Mailtext.
- Automatische Zuordnung bei ausreichend unabhängigen Übereinstimmungen;
  Alternativen bleiben bei Gleichstand offen. Mehrfachpositionen je TA addiert.
- Namensnormalisierung für bekannte Rechtsformen/Inhaberzusätze, Eurozeichen
  aus Tabellenüberschriften, Lieferdatum getrennt von Transportdaten.
- Falsche Anschrift/PLZ rot, fehlende notwendige Vergleichsdaten gelb.
- Kompakte Ergebniszeilen, Grün/Gelb/Rot-Prozentverteilung der Hauptprüfpunkte,
  ergänzende Angaben grau und ohne Einfluss auf den Balken. Kein allgemeiner
  Freigabe-/Prüfen-Text. Auftrags-Historie verwendet dieselbe Darstellung.
- Unveränderliche Berichte Version 3; gespeicherte Altberichte bleiben lesbar.

Führender Vertrag: [Rechnungsprüfung](../mailbox-invoice-review.md).

## Prüfung

- 139 gezielte Unit-/Vertragstests bestanden: invoiceReview, Policy, Assignment,
  Context, Reference, mailboxes, pdfOcr und Frontend-Presentation.
- 3 echte Demo-Firestore-Integrations-/Rulesprüfungen bestanden, keine übersprungen:
  atomare Berichte/Verknüpfungen und Idempotenz; Eigentümer-, fremde und privilegierte
  Clientzugriffe auf serverprivate Daten verweigert; Postfach-Push-Zugriffsschutz.
  Ziel `demo-drehpunkt-invoice`, Emulator danach beendet.
- Lint, Build und Abgleich von 45 deploybaren Shared-Modulen bestanden.
  Die bestehende Warnung zu großen JavaScript-Dateien bleibt.
- Echte KI-Erkennung einschließlich OCR mit beiden bereitgestellten Original-PDFs:
  RE4408 erkennt EUR, Empfängeranschrift, TA 261000561 ohne Zuordnungsunsicherheit,
  230,00 netto und separates Lieferdatum. MAKO erkennt EUR, Anschrift, TA 261000824,
  180,00 netto und ausdrücklich belegten Fristbeginn. Keine Originale, Rohantworten
  oder Secrets versioniert. Kein Mailversand, keine Buchung, keine Auftragsänderung.
- Browserprüfung mit synthetischen Daten: kompakte Zeilen/Prozentbalken,
  Deutsch/Englisch, Light/Dark, aufklappbare ergänzende Datumsabweichung.
  Kein vollständiger angemeldeter Postfachablauf durchgeführt; weitere echte
  Mail-/Bild-/Sammelrechnungsfälle bleiben Nutzerabnahme.

## Bereitstellung

Benötigte Backendänderung ausschließlich `reviewMailboxInvoices`, jeweils gezielt
in `db-bpl-drehpunkt-dev` und `db-bpl-drehpunkt`. Keine neuen Secrets, Rules,
Indizes, Migrationen oder Datenkopien. Bestehende Zugriffsprüfungen unverändert.
Backend am 03.11.2026 gezielt erfolgreich bereitgestellt und anschließend geprüft:

| Firebase-Projekt | Revision | Zustand | Ohne Anmeldung |
| --- | --- | --- | --- |
| db-bpl-drehpunkt-dev | reviewmailboxinvoices-00008-vaq | ACTIVE | HTTP 401 |
| db-bpl-drehpunkt | reviewmailboxinvoices-00002-jim | ACTIVE | HTTP 401 |

Die projektspezifische bestehende Laufzeitkonfiguration wurde erhalten;
Dev verwendet ausdrücklich seine bestehende Clientidentität und die bereits
festgelegte Unternehmenswährung EUR. Keine Produktionsidentität nach Dev kopiert.

Frontend-Veröffentlichung: derselbe freigegebene Gitstand nach `dev` und `main`.
Die zugehörigen Vercel-Builds sind am [Git-Stand](https://github.com/CornerDesign-Dominic/bpldrehpunkt/commits/main/)
zugeordnet. Der Backendnachweis allein ist kein Nachweis einer vollständigen
angemeldeten Browserabnahme.

Für die neuen Erkennungs- und Vergleichsregeln bestehende Ergebnisse ausdrücklich
mit „Mit aktuellen Auftragsdaten erneut prüfen“ neu auswerten; bloßes Öffnen
ändert unveränderliche Altberichte nicht.
