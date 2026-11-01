# Dev-Erinnerungen: Abnahme mit dem bestehenden BB-Testkonto

Ausdrückliche zusätzliche Nutzerfreigabe vom 01.11.2026: echte Testmails dürfen
auch an **bb@brennpunkt-logistik.de** gehen. Das bestehende aktive Dev-Testkonto
behält E-Mail/Login, Rolle und Rechte. Produktion und `main` bleiben unverändert.
Der vorherige [Erstbeleg](reminders-dev-2026-11-01-status.md) dokumentiert die
anfängliche No-reply-Begrenzung und ist hinsichtlich dieser Freigabe historisch.

## Begrenzte Anpassung

Die serverseitige Dev-Allowlist enthält exakt `no-reply@brennpunkt-logistik.de`
und `bb@brennpunkt-logistik.de`. Keine Umleitung, keine Domainfreigabe, kein
Trimmen oder Umschreiben. DF und andere Adressen bleiben blockiert. Die
Produktionsregel und alle laufenden Produktionsbereitstellungen werden nicht
geändert. Die aktuelle Remote-Dev-Basis `2eef664` einschließlich der
Auftragsarbeitsplatz-Änderungen wurde vorab zusammengeführt.

Nur `scheduledCaseDeadlineReminderDispatch` und `listReminderStatuses` müssen
erneut in **db-bpl-drehpunkt-dev**, Region **europe-west3**, bereitgestellt
werden. Die existierenden sechs Dev-Secretbindungen bleiben erhalten. Keine
neuen Secrets, Rules, Indizes oder Datenmigration nötig. Der Client erkennt den
Dev-Testhinweis mit alter und neuer Formulierung; der neue Text ist deutsch und
englisch verfügbar. Die bestehenden Provider-Allowlist und Dienstidentität
werden nicht erweitert: BB war dort bereits als Testempfänger enthalten.

## Automatische Prüfung vor Bereitstellung

13 gezielte Unit-/Adaptertests und fünf tatsächlich ausgeführte
Firestore-Emulatorprüfungen bestanden, null übersprungen. Enthalten sind
BB-Versand, Deduplizierung, abgewiesene Adressen und der erneute Profilabgleich
zwischen zwei erlaubten Adressen: Ein zwischen Auswahl und Versand geänderter
Empfänger bleibt unzulässig. Testemulator beendet. Lint, Build und Abgleich
aller 45 Shared-Module erfolgreich.

## Live-Abnahme

Die Durchführung wird nach den regulären Dev-Schedulerläufen ergänzt. Echte
Prüfmails dieser Abnahme ausschließlich an BB, mit eindeutiger synthetischer
Kennzeichnung `DEV-REMINDER-BB-20261101`. Keine direkte Testfunktion anstelle
des regulären Erinnerungsdienstes. Quellen werden über die angemeldete
Oberfläche mit explizitem Datum und Berliner Uhrzeit gespeichert; technische
Belege werden zusätzlich lesend über den bestehenden IAM-Betriebszugang geprüft.

Zwei isolierte synthetische Geschäftspartner und ein synthetischer TA dienen
nur den zwingenden Auswahlfeldern von Inkasso, Insolvenz und Gericht/Streit.
Sie enthalten keine operativen Nummern, Kontaktadressen oder Transportfenster.
Insolvenzanlage darf dadurch nur den synthetischen Partnerstatus verändern.
Eigentliche Fallerfassung und Fristanlage erfolgen über die normale Oberfläche.
Regulär verbrauchte Dev-Jahresfallnummern werden nicht zurückgedreht.

Ausgangszustand: 187 Dev-Functions, null Erinnerungsarbeitsaufträge und null
fachliche Versandbelege. Regulärer Scheduler aktiv, globale Mailpause aus
(Pause-Dokument fehlt). Vorher-/Nachher-Metadaten bleiben lokal ohne Secretwerte.

## Während der realen Abnahme bestätigter Robustheitsbefund

Die Schadenfrist um 14:00 Uhr wurde vom Provider zugestellt, ihre Bestätigung
überschritt aber das bisherige Zehn-Sekunden-Limit: Reservierung 13:00:04.590 UTC,
lokaler Abbruchbeleg 13:00:14.817 UTC, `uncertain/provider-outcome-unknown`.
Keine erneute Zustellung ausgelöst. Dieselbe Versand-ID
`c591221dbb6c97cbc45e0c62236eb4b076e9b7987ce09056612a73cf5d596b4b`
ist in der Dev-Versandliste `accepted`; die synthetische Schadenmail ist im
BB-Postfach um 14:00 Uhr sichtbar. Diese Bestätigungsverzögerung darf nicht als
fehlgeschlagene oder automatisch zu wiederholende Zustellung behandelt werden.

Der Adapter erhält deshalb maximal 25 statt zehn Sekunden für Anmeldung und
Bestätigung, weiterhin begrenzt durch die verbleibende Fälligkeitsminute. Keine
neue Wiederholung und keine Verlängerung über diese Minute hinaus. 16 aktuelle
Unit-/Adaptertests bestanden, darunter drei deterministische Zeitprüfungen:
13 Sekunden mit Anmeldung und verspäteter Bestätigung erfolgreich; selbst ein
zu großes Override bleibt bei 25 Sekunden begrenzt; bei Beginn um Sekunde 56
läuft die harte Frist trotz zweisekündiger Anmeldung nach insgesamt vier
Sekunden ab. Das bestehende Workerbudget und seine Durchsatzgrenze bleiben
erhalten. Nur der Dev-Scheduler muss für diese Korrektur erneut bereitgestellt
werden; Produktion wird nicht aktualisiert.

Separater Nebenbefund: Die TA-Auswahl filtert auch ohne gesetzten Datumsfilter
Aufträge ohne `imported.loading.window.from` aus
(`functions/transportOrderList.js`, `loadingStartMatches`). Für den synthetischen
Gerichts-Testauftrag wurde ein zukünftiges Ladedatum ergänzt. Der allgemeine
Such-/Datumsvertrag wurde in dieser Erinnerungsabnahme nicht verändert.
