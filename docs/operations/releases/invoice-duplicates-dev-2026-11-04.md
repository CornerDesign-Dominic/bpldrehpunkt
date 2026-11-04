# Rechnungsdubletten und Warnhinweise – Dev 04.11.2026

Nutzerfreigabe ausschließlich für Dev; main und Produktion bleiben auf a4b274d.
Isolierte Umsetzung auf codex/invoice-duplicates-dev ab origin/dev (a4b274d).

## Umfang

- „Rechnung bereits in DyCoS vorhanden“ bei bestätigtem gleichen UTN, exakter
  bereinigter Kopf-ExterneBelegnummer, gleichem ganzen Bruttobetrag und gleicher
  Originalwährung. Stornierte Belege ausgeschlossen.
- Hoher Dublettenverdacht gelb, exakter Treffer rot; gesicherte Betragsabweichungen
  mit Werten/Währung ebenfalls rot direkt unter dem Prozentbalken.
- Aktuelle lesende Belegprüfung auch bei vollständigen lokalen TAs; einmal je TA
  im Prüflauf, begrenzte Parallelität. Unvollständige Abfragen bleiben offen.
- Berichte Version 5 mit minimalen Trefferbelegen/strukturierten Alerts; keine
  Auftrags-/Stammdatenänderung, Buchung, Zahlung oder Mailversand.
- Vertragsdetails unter [Rechnungsprüfung](../mailbox-invoice-review.md).

## Prüfung

194 gemeinsame gezielte Unit-/Vertragstests bestanden; danach abschließende
Billing-Projektionssuite mit 20 Tests (sechs zusätzliche Regressionen) erfolgreich.
Lint, Build und Shared-Abgleich (45 Module) bestanden. Bestehende Warnung großer
JavaScript-Dateien bleibt. Drei isolierte Demo-Firestore-Integrations-/Rulesprüfungen
bestanden, keine übersprungenen Tests; Emulator beendet.

Zwei echte lesende DyCoS-TA-Abrufe mit Dev-Identität prüfen die tatsächlichen
Faktura-Kopf-Felder und das Mapping. Gegen aus diesen Belegen abgeleitete
Vergleichseingaben: exakter Treffer rot, ähnliche Nummer gelb, simuliertes Storno
kein Alert. Die Simulation hat keine Quelldaten verändert. Kein neuer echter
Mail-/KI-Durchlauf; dieser bleibt Nutzerabnahme auf Dev.

Browserprüfung mit synthetischen Daten: Hinweise unmittelbar unter dem Balken,
gemeinsame rote Dubletten-/Betragsmeldung und gelber Verdacht, Werte und TA,
Deutsch/Englisch, Light/Dark. Einheitliche Ergebnisdarstellung auch im Auftragsbericht.

## Veröffentlichung

Gezielt gemeinsam bereitzustellen in db-bpl-drehpunkt-dev:
reviewMailboxInvoices und processMailboxActionRun. Gleiches Quellpaket beider
Ausführungspfade anhand Objektprüfsumme/Größe prüfen. Keine Rules-/Indexänderung,
keine neuen Secrets oder Datenmigration. Frontend ausschließlich per Push nach dev.
main bleibt auf a4b274d; keine Produktionsbereitstellung.

Dev-Backend am 04.11.2026 erfolgreich bereitgestellt und verifiziert:

| Funktion | Revision | Zustand |
| --- | --- | --- |
| reviewMailboxInvoices | reviewmailboxinvoices-00010-zax | ACTIVE |
| processMailboxActionRun | processmailboxactionrun-00009-duq | ACTIVE |

Beide Ausführungspfade verwenden identische Quellpakete (Prüfsumme und 900.746 Bytes
verglichen). Frontendstand am zugehörigen Dev-Commit; Vercel-Preview wird danach
gegen diesen Commit geprüft. Kein Push nach main und kein Produktionsdeploy.
