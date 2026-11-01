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

Nur `scheduledCaseDeadlineReminderDispatch` und `listReminderStatuses` wurden
erneut in **db-bpl-drehpunkt-dev**, Region **europe-west3**, bereitgestellt
. Die existierenden sechs Dev-Secretbindungen bleiben erhalten. Keine
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

Die fachliche Abnahme ist abgeschlossen. Echte Prüfmails dieser Abnahme gingen
ausschließlich an BB, mit eindeutiger synthetischer
Kennzeichnung `DEV-REMINDER-BB-20261101`. Keine direkte Testfunktion anstelle
des regulären Erinnerungsdienstes. Quellen werden über die angemeldete
Oberfläche mit explizitem Datum und Berliner Uhrzeit gespeichert; technische
Belege werden zusätzlich lesend über den bestehenden IAM-Betriebszugang geprüft.

Zwei isolierte synthetische Geschäftspartner und ein synthetischer TA dienen
nur den zwingenden Auswahlfeldern von Inkasso, Insolvenz und Gericht/Streit.
Sie enthalten keine operativen Nummern oder Kontaktadressen. Der Testauftrag
erhielt für die Auswahl einen eindeutig synthetischen Nummernwert und ein
zukünftiges Ladefenster (siehe Nebenbefund unten).
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
erhalten. Nur der Dev-Scheduler wurde für diese Korrektur erneut bereitgestellt;
Produktion wurde nicht aktualisiert.

Der ursprüngliche unklare Beleg wurde erst nach exaktem Abgleich seiner
Versand-ID und des Payload-Digests in der Providerliste mit dem geöffneten
BB-Maileingang auf `accepted` abgeglichen. Der vorhandene Beleg enthält dafür
`reconciliation`: ursprünglicher Status/Grund/Zeitpunkt, tatsächlicher
IAM-Operator, Evidenzhash und Providerdigest. Es wurde kein neuer Versand
ausgelöst und der ursprüngliche Timeout nicht aus dem Verlauf entfernt.

## Tatsächliche Versandmatrix

Alle Zeiten am 01.11.2026 in Europe/Berlin. Die Aufträge wurden über die normale
angemeldete Dev-Oberfläche angelegt; die regulären Quelltrigger und der reguläre
Minutenscheduler wurden verwendet. Jeder Versandversuch begann innerhalb seiner
Sollminute. Maileingang: Absender `drehpunkt@brennpunkt-logistik.de`, Empfänger
`bb@brennpunkt-logistik.de`, keine andere Empfängeradresse.

| Quelle | Sollzeit | Tatsächlicher Befund |
| --- | --- | --- |
| Persönlicher Kalender | 13:50 | Ein Versandbeleg, eine Mail; erneutes Speichern und zusätzlicher Schedulerlauf in derselben Minute erzeugten keinen zweiten Versand |
| Gemeinsamer Kalender | 13:51 | Mail an den aktuell berechtigten BB-Nutzer |
| Zugewiesenes To-do | 13:52 | Aktueller Bearbeiter BB erinnert |
| Offenes To-do ohne Bearbeiter | 13:53 | Ersteller BB erinnert, Bearbeiter bleibt leer |
| Separate To-do-Frist | 13:54 | Zuständigkeit des übergeordneten To-dos verwendet |
| Schadenfrist | 14:00 | Tatsächliche Zustellung; verspätete Bestätigung anschließend mit dokumentierter Evidenz abgeglichen |
| Inkassofrist | 14:01 | Vorheriges Entfernen der Zuständigkeit blockierte den Status; nach Wiederzuordnung tatsächliche Zustellung |
| Insolvenzfrist | 14:05 | Tatsächliche Zustellung an den zugeordneten Nutzer |
| Gericht-/Streitfrist | 14:15 | Tatsächliche Zustellung unter dem korrigierten Bestätigungsfenster |
| Eigenständiger Schaden-Nachtest | 14:17 | Neue Frist unter der korrigierten Version automatisch bestätigt und zugestellt |

Zusätzlich wurde ein Abschluss-Negativtest um 14:18 Uhr zunächst falsch
vorbereitet: Der Fall wurde erst um 14:18:28 geschlossen. Die zuvor korrekt
begonnene Erinnerung wurde daher zugestellt. Das ist die elfte Testmail und
kein Doppelversand. Der Test wurde mit einem **bereits geschlossenen** Fall und
neuem Zeitpunkt 14:22 Uhr wiederholt: kein zusätzlicher Versandbeleg, keine
weitere Mail. Der Fallabschluss dieses isolierten Negativtests wurde über den
IAM-Betriebszugang gesetzt; die Zahlungs-/Abschlussbedienung des Inkassomoduls
ist damit ausdrücklich nicht abgenommen.

Weitere Negativfälle: ausgeschalteter Kalendertermin, bereits verpasster
Kalendertermin und vor der Folgefrist abgeschlossenes To-do erzeugten keine
Mail. Der To-do-Abschluss erfolgte über die normale Oberfläche. Insgesamt
**elf tatsächliche Posteingangstreffer und elf dauerhafte Versandbelege**, alle
an BB. Keine Belege für die verpasste/ausgeschaltete/unterdrückte neue Fälligkeit,
keine automatischen Wiederholungen. Das Fehlen eines no-reply@-Nutzerprofils
blockiert diese fachliche Abnahme nicht mehr; es wurden keine Konten,
Anmeldedaten oder Nutzerrechte geändert.

Die Abnahme nutzt das vorhandene BB-Konto. Eine zweite reale Nutzeranmeldung
und ein Mehrbenutzer-/Spitzenlasttest wurden nicht durchgeführt; zugehörige
Empfänger-/Rechtefälle sind weiterhin durch die gezielten automatischen und
Emulatorprüfungen abgedeckt.

## Abschluss, Bereinigung und Umgebungsgrenzen

Veröffentlichte Funktionsstände: `scheduledCaseDeadlineReminderDispatch`
Revision `scheduledcasedeadlinereminderdispatch-00009-tab` und
`listReminderStatuses` Revision `listreminderstatuses-00002-toh`, jeweils ACTIVE.
Quelle der Bestätigungsänderung: Commit `9caeda8`; BB-Freigabe/Client:
`b3a0092`, mit erfolgreichem Vercel-Status. Die übrigen 185 Dev-Function-Revisionen
blieben unverändert. Alle sechs gebundenen Secretversionen bleiben bei 1;
Firestore-Rules unverändert, keine Indizes oder Storage-Rules bereitgestellt.
Der reguläre Scheduler ist aktiv; die globale Mailpause entspricht dem
ursprünglichen Zustand (Pause-Dokument fehlt).

53 eindeutig zugeordnete Testdokumente einschließlich aller 14
Erinnerungsquellen, Testpartner, Testauftrag, Kalenderspiegel und Verknüpfungen
entfernt. Eine zwischenzeitlich ergänzte Verknüpfung des Schaden-Testfalls
S-2026-0002 mit TA 260800063 wurde zunächst erhalten und ausdrücklich beim
Nutzer geklärt. Nach dessen Bestätigung „war zum Testen“ wurden auch dieser
Fall und die Testverknüpfung entfernt. **TA 260800063 selbst bleibt erhalten.**
Alle elf dauerhaften Versandbelege einschließlich der dokumentierten
Bestätigungsabklärung bleiben erhalten. Keine Jahresfallzähler zurückgesetzt.
Nachprüfung: null offene Erinnerungsarbeitsaufträge, keine verbliebenen
Testfälle; vollständiger Hashvergleich aller bestehenden Nutzerprofile
unverändert.

Lesender Vorher-/Nachher-Abgleich: alle 126 Produktions-Function-Revisionen
einschließlich Änderungszeiten und aktives Produktions-Ruleset unverändert.
Remote-`main` bleibt `230c2ad86af9700118e2f1456746292241461efc`.
Keine Produktionsbereitstellung, Datenaufbereitung oder neue Produktionsmail.
Die Vercel-Verwaltungs-API war mit der vorhandenen lokalen Anmeldung nicht
lesbar (403); Dev-Build-Erfolg wurde über den verbundenen GitHub-Vercel-Status
geprüft. Ein neuer direkter Vergleich der Vercel-Produktionsziel-Metadaten wird
deshalb nicht behauptet.

Separater Nebenbefund: Die TA-Auswahl filtert auch ohne gesetzten Datumsfilter
Aufträge ohne `imported.loading.window.from` aus
(`functions/transportOrderList.js`, `loadingStartMatches`). Für den synthetischen
Gerichts-Testauftrag wurde ein zukünftiges Ladedatum ergänzt. Der allgemeine
Such-/Datumsvertrag wurde in dieser Erinnerungsabnahme nicht verändert.
