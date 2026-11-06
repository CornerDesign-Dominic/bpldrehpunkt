# Gesammeltes Postfachpaket – Dev 05.11.2026

Ausdrücklich beauftragt: sämtliche gesammelten Änderungen dieses Arbeitsstands
auf Dev veröffentlichen. Main und Produktion bleiben unverändert. Basis ist
origin/dev e41e28b einschließlich Vertragsverwaltung und KI-Betriebsarten.
Zusätzlich enthalten: Haftbarhaltungs-Layout 28b901e sowie die fertige erweiterte
Vertragsakte bis 21ab1a8/5ec0363 (Kalender, Positionen, Dokumente, Historie und
Iconaktionen). Die ältere Desktop-Arbeitskopie wird nicht pauschal darüber kopiert; deren bereits
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
Bundlegrößenwarnung bleibt. Erster Emulatorlauf nach Zusammenführung: 29 erfolgreich; nach Aufnahme der
erweiterten Vertragsakte zusätzlich 18 Firestore-/Storage-/Rechtetests erfolgreich.
Weitere 43 Vertrags-/Kalender-/Diagnosetests und sechs Haftbarhaltungs-UI-Tests
erfolgreich. Lint und Build nach den jeweiligen Zusammenführungen erneut erfolgreich.

Die vorherigen lokalen Browserprüfungen mit synthetischen Daten und vier echten
Modellproben mit synthetischen Mails sind im [Fachvertrag](../mail-triage.md)
abgegrenzt; sie sind kein Nachweis einer echten neuen Mail nach Veröffentlichung.
Keine Testmails versendet, keine echten Fälle/Buchungen angelegt.

## Bereitstellung

Firebase-Ziel ausschließlich db-bpl-drehpunkt-dev. Frontend über dev/Vercel.
Firestore Rules enthalten die bisherigen Fachregeln einschließlich Verträgen und
verwehren direkten Zugriff auf die beiden neuen privaten Feedback-Collections.
Keine neuen Indizes, Secrets oder Microsoft-Rechte. Die parallel veröffentlichte
erweiterte Vertragsakte bringt ihre getesteten Storage-Regeln mit; deren aktiver
Dev-Stand stimmt exakt mit dem gemeinsamen Quellstand überein.

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

## Nachweis und Abnahmegrenzen

Die 24 aufgeführten Functions wurden erfolgreich erstellt/aktualisiert. Rechnungs-
Direktprüfung und Hintergrundjob sind ACTIVE mit derselben Quellpaket-Prüfsumme
A3Auz7CtGsXLFtAzaomMWg==: reviewmailboxinvoices-00019-zic und
processmailboxactionrun-00019-xoq. Die zwei Diagnoseexports werden anschließend
nochmals aus dem zusammengeführten Vertrags-/Maileinordnungsstand bereitgestellt,
damit beide gleichzeitig ihre neuen Diagnoseaktionen unterstützen.
Die Vertragsfunctions mutateContract und listSystemCalendarSources sind ebenfalls
ACTIVE (parallele autorisierte Vertragsveröffentlichung).

Der CLI-Regel-Upload scheiterte wiederholt an HTTP 503. Der identische bereits
kompilierte und emulatorgeprüfte Quellstand wurde anschließend über die offizielle
Rules-API angelegt und aktiviert. Anschließendes Rücklesen bestätigt exakte
Übereinstimmung (normalisierte Zeilenenden):

- Firestore-Ruleset: 6fd2a69c-c33e-43dc-8383-2a55c9a8d45b,
  aktiviert 05.11.2026 12:52:48 UTC.
- SHA-256: f860bdc9babdca5a581022629fc604a9426f0d77c322fc2b98c7c2dcf68e5f94.
- Storage-Ruleset: 06889bc1-1b97-4b63-8d67-5d2237c2ac1f, identischer aktiver Stand.

Frontendbasis nach Zusammenführung: 47b9c509688b9f8dcf3884e568745579e5d682c6;
dieser Releasebeleg ergänzt den Stand. Veröffentlichung ausschließlich über dev
mit erfolgreichem Vercel-Status als Abschlusskriterium. Main bleibt unverändert
bei a4b274d09399bdfdbdb298e3b09b5842fcf01c71.

Die vollständige Fachabnahme mit neuen eingehenden Mails übernimmt der Nutzer.
Bestehende Mails werden nicht rückwirkend automatisch neu eingeordnet. Für neue
Normalnutzer müssen die Qualitätsrechte bei Bedarf ausdrücklich vergeben werden;
keine Profile wurden pauschal erweitert.


## Nachkontrolle der gemeinsamen Veröffentlichung

Alle 24 benötigten Exporte anschließend ACTIVE bestätigt, einschließlich der
zusammengeführten Diagnose: reportclientdiagnostic-00029-fam und
listdiagnosticspage-00023-dag. Der erste Vercel-Build 73c9bb1 war erfolgreich.
Die echte angemeldete Browserkontrolle deckte danach eine fehlende Sprachzuordnung
für den neuen Sidebar-Eintrag auf (leere Seite nach Anmeldung). Die explizite
Zuordnung und deutsche/englische Texte wurden ergänzt. Eine zusätzliche Prüfung
aller statischen Sidebarziele verhindert solche fehlenden Zuordnungen; fünf
Sprach-/Navigationsprüfungen, Projektlint und Build sind erfolgreich.
Der entsprechende korrigierte Frontendstand ersetzt den ersten Build.
