# Gesammeltes Postfachpaket – Dev 05.11.2026

Ausdrücklich beauftragt: sämtliche gesammelten Änderungen dieses Arbeitsstands
auf Dev veröffentlichen. Main und Produktion bleiben unverändert. Basis ist
origin/dev e41e28b einschließlich Vertragsverwaltung und KI-Betriebsarten.
Die ältere Desktop-Arbeitskopie wird nicht pauschal darüber kopiert; deren bereits
veröffentlichte Weiterentwicklungen bleiben über den aktuellen Dev-Stand erhalten.

## Umfang

- Strukturierte Maileinordnung mit fünf Fragen, begrenzten Originalfundstellen,
  Vorschau vor manuellem Start und Verwerfen mit Begründung. Bestehende Fachaktionen
  und automatisch vorbereitete Ergebnisse bleiben nutzbar.
- Eigener Qualitätsreiter Maileinordnung mit Rückmeldungen, Prüfernotiz und
  gezielter Bereinigung. Neue Rechte mailTriageQuality und mailTriageCleanup
  starten für normale Nutzer bei none; Vergabe über bestehende Rechteverwaltung.
- Bereits gebuchte Rechnungen behalten den roten Hinweis, zählen jedoch nicht
  als Fehler in die Korrektheitsskala.
- Rechnungsprüfung nach KI-Auswertung gelb; Prüfung fertig setzt grün,
  Wieder in Bearbeitung setzen wieder gelb. Auch gemeinsame Postfächer behalten
  berechtigte gemeinsame Bearbeitung; kein erneuter KI-Lauf beim Statuswechsel.
- Status, Auftragserfassung und AGB wieder jeweils eine vollständige Aktionszeile.

## Prüfstand

Nach Zusammenführung: 414 gezielte Unit-/Regressionsprüfungen und vier
React-UI-Prüfungen der KI-Einstellungen erfolgreich. Lint, Build,
Functionssyntax und Shared-Abgleich (46 Module) erfolgreich. Bestehende
Bundlegrößenwarnung bleibt. Emulatorabschluss wird unten ergänzt.

Die vorherigen lokalen Browserprüfungen mit synthetischen Daten und vier echten
Modellproben mit synthetischen Mails sind im [Fachvertrag](../mail-triage.md)
abgegrenzt; sie sind kein Nachweis einer echten neuen Mail nach Veröffentlichung.
Keine Testmails versendet, keine echten Fälle/Buchungen angelegt.

## Bereitstellung

Firebase-Ziel ausschließlich db-bpl-drehpunkt-dev. Frontend über dev/Vercel.
Firestore Rules enthalten die bisherigen Fachregeln einschließlich Verträgen und
verwehren direkten Zugriff auf die beiden neuen privaten Feedback-Collections.
Keine neuen Indizes, Secrets, Storage-Regeln oder Microsoft-Rechte.

Benötigte Functions gemeinsam aus demselben Quellstand:

- reviewMailboxInvoices
- processMailboxActionRun
- startMailboxAction
- getMailboxAction
- listMailboxActions
- updateMailboxAction
- processMailboxRecommendationRun
- listMailboxRecommendations
- getMailboxRecommendationSettings
- setMailboxRecommendationSettings
- listManagedMailboxRecommendations
- maintainMailboxRecommendationSubscriptions
- mailboxRecommendationWebhook
- submitMailboxTriageFeedback
- listMailboxTriageFeedback
- updateMailboxTriageFeedback
- deleteMailboxTriageFeedback
- reportClientDiagnostic
- listDiagnosticsPage
- listManagedUsers
- createManagedUser
- updateManagedUser
- applyMailboxTracking
- assignMailboxAgbCustomer

Bereitstellungsnachweis und verbleibende Liveabnahme werden nach Abschluss ergänzt.
