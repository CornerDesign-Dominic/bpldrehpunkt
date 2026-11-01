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
