# Zentrale Erinnerungen: getrennte Dev-Veröffentlichung

Nachtrag: Die spätere ausdrückliche BB-Empfängerfreigabe und vollständige
fachliche Dev-Abnahme stehen im [Folgebeleg](reminders-dev-bb-2026-11-01-status.md).
Die No-reply-Begrenzung und offene Profilabnahme unten beschreiben den Erststand.

Ausdrückliche Nutzerfreigabe vom 01.11.2026: Erinnerungsflow zuerst ausschließlich
in Firebase Dev anbinden, alle benötigten Bestandteile veröffentlichen und
gründlich prüfen. Produktion und `main` bleiben unverändert; echte Testmails
ausschließlich an `no-reply@brennpunkt-logistik.de`.

Ziel: `db-bpl-drehpunkt-dev`, Region `europe-west3`, Dev-Oberfläche
`https://dev.drehpunktlogistik.de`. Isolierter Releasebranch
`codex/reminders-dev-release` auf der Integrationsbasis
`c6601053c74c5fedb3d138d2b8e81a7c2b0dd535`, ergänzt um den geprüften
Erinnerungsstand `eae075c`. Neuere Postfach-/Auftragsabläufe wurden erhalten;
vier Konflikte in Diagnose/Imports wurden zusammengeführt. Der ursprüngliche
Desktop-Arbeitsstand wird nicht verändert. Remote-`main` vor Beginn:
`230c2ad86af9700118e2f1456746292241461efc`.

Die später hinzugekommene Remote-Dev-Änderung `c7f0f40` an den Postfachdialogen
wurde vor dem Frontend-Push zusätzlich zusammengeführt. Die erste geprüfte
Frontend-Bereitstellung `ccf7e5e` erfolgte ausschließlich nach `dev` als
Vercel-Preview `dpl_6ZeurEMBYSVnRWmB6qJLpTjoLrm3`.
Der gemeinsame Abschlussstand **`0b27039`** mit sichtbarem Dev-Testhinweis und
Betriebsdokumentation ist ebenfalls veröffentlicht: Dev-Alias auf
`dpl_DmJAGwsi8Myde1YTB6tjjAqAYLoM`, Zustand `READY`. Dieser abschließende
Belegnachtrag wird nur lokal versioniert; er benötigt keinen weiteren
Frontend-Build.

## Veröffentlichte Bestandteile

- Bestehenden Dev-Scheduler und automatischen Mailversand für den Übergang
  kontrolliert pausiert. Ursprünglich war der Scheduler aktiv; ein globaler
  Mailpause-Beleg existierte nicht. Rückkehrdaten liegen lokal außerhalb Git.
- Sechs eigene Dev-Secrets mit Version 1 angelegt: `POWER_AUTOMATE_REMINDER_URL`
  und die fünf `REMINDER_*`-Parameter aus dem Fachvertrag. Werte wurden nicht
  in Git übernommen. Produktions-Secrets werden nicht beschrieben.
- Reminder-Scheduler, Quell-/Parent-Trigger, Callables, kompatible Vorbereitung,
  Diagnose und Vorlagenverwaltung gehören zum Backendumfang. Neue private
  Erinnerungscollections und Schedule-/Zuständigkeitsregeln gehören zu den Rules.
  Neue zusammengesetzte Indizes und Storage-Änderungen sind nicht erforderlich.
- Frontend für Kalender, To-dos und Fachfristen ist mit veröffentlicht, da die
  neuen Zeit-/Status-/Zuständigkeitsverträge zusammenpassen müssen.
- Zusätzlicher Dev-Guard **vor** Reservierung und Legacy-Übernahme, erneut vor
  Versand und im Adapter: ausschließlich no-reply@, ohne Umleitung. Die zwei
  vorhandenen Dev-Nutzerprofile wurden nicht verändert; keines besitzt diese
  Adresse. Eine positive Benutzer-/Schedulerabnahme mit einem echten
  no-reply@-Profil ist deshalb derzeit nicht möglich. Keine Testkonten oder
  Anmeldetokens werden dafür erzeugt. Der reale Transport wird getrennt in der
  Dev-Laufzeit mit dem bereitgestellten Code geprüft.

## Bislang abgeschlossene Prüfungen

50 gezielte Backend-/Vertragsprüfungen, 26 Frontend-/Diagnoseprüfungen sowie
39 echte lokale Emulatorprüfungen erfolgreich, keine übersprungen. Die
Emulatorprüfungen umfassen Empfängerwechsel, 501 Altquellen, mehr als 100
Reservierungen, Parent-Fortsetzung, Zuständigkeiten und die neuen Rules inklusive
40 vollständiger Fachwrites. Emulator beendet. Lint, Build (692 Module), Laden
aller 187 Function-Exporte und Abgleich der 45 Shared-Module erfolgreich.

Nach Übernahme von `c7f0f40` wurden Lint und Build erneut erfolgreich ausgeführt.

## Tatsächliche Cloud- und Mailprüfung

18 benannte Functions wurden gezielt veröffentlicht; alle sind `ACTIVE`.
Die übrigen 169 Dev-Function-Revisionen blieben unverändert. Gesamter Bestand
nach Entfernung der temporären Prüffunktion: 187.

- Versand: `scheduledCaseDeadlineReminderDispatch`.
- Quelltrigger: `maintainCaseDeadlineReminderWork`,
  `maintainCalendarEventReminder`, `maintainTodoReminders`.
- Parent-Trigger: `maintainCalendarReminderParent`,
  `maintainDamageReminderParent`, `maintainInkassoReminderParent`,
  `maintainLegalReminderParent`, `maintainInsolvencyReminderParent`.
- Callables: `listReminderStatuses`, `listCaseReminderUsers`,
  `setReminderResponsibility`, `prepareReminders`, `prepareBackgroundWork`.
- Diagnose/Vorlagen: `reportClientDiagnostic`, `listDiagnosticsPage`,
  `listSystemMailTemplates`, `updateSystemMailTemplate`.

Die sechs tatsächlich am Scheduler gebundenen Secretversionen sind jeweils 1.
Die veröffentlichten Firestore-Rules stimmen mit der geprüften Quelldatei
überein. Datenaufbereitung in fünf begrenzten Seiten abgeschlossen: drei
vorhandene Fristen erfasst, kein Versand und keine Nachholung ausgelöst.
Keine Indizes oder Storage-Rules verändert.

Eine kurzlebige, durch IAM geschützte Firebase-Scheduler-Prüffunktion verwendete
denselben bereitgestellten Mailadapter, dieselben sechs Dev-Secrets und dasselbe
Runtime-Dienstkonto. Keine umgangene Mailpause, simulierte Anmeldung oder
umgebogene Nutzerprofile. Ergebnis am 01.11.2026 um **01:24 Uhr Europe/Berlin**:

| Prüfung | Ergebnis |
| --- | --- |
| Neuer Versand ausschließlich an no-reply@ | `accepted` |
| Identische Wiederholung derselben Versand-ID | `accepted`, kein zweiter Posteingangseintrag |
| Negativprüfung für df@ | Vor externem Versand blockiert |
| Tatsächlicher Posteingang | Genau ein Treffer im verbundenen no-reply@-Postfach, Kopf und Inhalt geöffnet |
| Tatsächlicher Absender | `drehpunkt@brennpunkt-logistik.de` |

Der stabile technische Prüfbeleg bleibt unter
`reminderState/release-probe-20261101` erhalten. Temporäre Prüffunktion,
zugehöriger Scheduler und der zuvor ungeeignete separate Prüfcontainer-Job
wurden entfernt. Dessen Starts scheiterten vor Ausführung des Mailcodes und
sind kein Versandnachweis. Kein öffentlicher Testendpunkt bleibt zurück.

Die globale Übergangspause ist auf den ursprünglichen Zustand zurückgesetzt
(Dokument zuvor und danach nicht vorhanden). Der reguläre Scheduler ist wieder
`ENABLED`, minütlich; tatsächliche Aufrufe liefern HTTP 200. Die drei neuen
privilegierten Callables Status/Zuständigkeit/Vorbereitung lehnen anonyme
Aufrufe jeweils mit HTTP 401 ab.

## Tatsächliche Browserprüfung und Grenzen

- To-do über die Oberfläche angelegt; explizite Berliner Erinnerungszeit
  gespeichert, in der Historie dokumentiert und nach Neuladen unverändert.
  Tatsächlicher Quelltrigger erzeugte den Arbeitsauftrag für 01:25 Uhr.
- Der reguläre Scheduler verarbeitete diese Fälligkeit: Empfänger im Dev-Modus
  blockiert, Arbeitsauftrag entfernt, **kein** dauerhafter Versandbeleg und keine
  Mail für dieses Nutzerprofil. Keine Umleitung an das Testpostfach.
- Persönlichen Kalendertermin mit expliziter Erinnerung gespeichert und erneut
  geöffnet. Deaktivierung speicherte `reminderEnabled=false`, entfernte Datum/
  Uhrzeit und Arbeitsauftrag; Quellstatus `disabled`.
- Separate To-do-Frist über die Oberfläche für 01:40 Uhr angelegt. Der echte
  Fristtrigger erzeugte `scheduled` mit Arbeitsauftrag. Nach dem Abschluss des
  übergeordneten To-dos aktualisierte der Parent-Trigger den Friststatus auf
  `suppressed`; kein Versandbeleg. Ein gültiger zukünftiger Arbeitsauftrag kann
  dabei bewusst bis zur Fälligkeit bestehen bleiben (siehe Fachvertrag).
- Ausschließlich die zwei eindeutig benannten synthetischen Quellen samt neu
  erzeugten To-do-Unterdaten und dem zugehörigen `todoCalendarEntries`-Spiegel
  anschließend entfernt (neun synthetische Dokumente). Persönlicher Kalender,
  normale Nutzerdaten, technische Prüfbelege und dauerhafte Versandlisten bleiben
  erhalten. Keine Rollen, Nutzerprofile oder Empfängeradressen geändert.
  Nachprüfung: alle drei Originalquellen und ihre Arbeitsaufträge entfernt;
  insgesamt null verbliebene Erinnerungsarbeitsaufträge.
- Die bestehende Status-Callable funktioniert in der angemeldeten Dev-Oberfläche.
  Der konkrete Dev-Testmodus-Hinweis wird zusätzlich sichtbar dargestellt,
  deutsch und englisch, damit ein berechtigter Nutzer nicht nach einer
  vermeintlich fehlenden Profilberechtigung suchen muss.

Ein positiver fachlicher Scheduler-Versand an einen echten no-reply@-Nutzer
bleibt **ungeprüft**, weil kein solches Dev-Nutzerprofil existiert. Der echte
Transporttest ersetzt diese Empfänger-/Fachabnahme nicht. Gemeinsame Kalender,
Empfängerwechsel und die fünf Fristfamilien sind gezielt automatisch und mit
Rules-/Firestore-Emulator geprüft; keine vollständige Live-Abnahme aller
Fachmasken oder Rollen wird behauptet. Diese Empfängerbegrenzung wird erst nach
neuer ausdrücklicher Freigabe erweitert.

## Abgrenzung gegen Produktion

Lesender Vorher-/Nachher-Abgleich: alle 126 Produktions-Function-Revisionen
einschließlich Änderungszeitpunkten und das aktive Firestore-Ruleset unverändert.
Vercel-Produktionsbranch bleibt `main`, Produktionsdeployment
`dpl_H6NVNYTMRuunkCJwUQAvBCm1QzXW` unverändert. Keine Produktionsdatenmigration,
keine Produktionssecrets, kein neuer Produktionsversand. Der vorbereitete neue
Produktionsflow wurde nicht eingeschaltet.
Remote-`main` nach der Veröffentlichung weiterhin
`230c2ad86af9700118e2f1456746292241461efc`.

Rückweg: Dev-Frontend kann auf das vorherige Preview `dpl_QXnC7EV6ifTyWWe5nDWUBbAyRx6U`
zurückgestellt werden. Für das Backend den zentralen Scheduler zuerst pausieren;
Frontend-Rückkehr setzt Functions/Rules und Projektionen nicht zurück. Neue
private Status-/Versandbelege nicht löschen oder alte Fälligkeiten neu einplanen.

## Sicherheitsbefund bei der Vorbereitung

Der Befehl `firebase login:list --json` gab unerwartet auch vorhandene
CLI-Anmeldedaten im privaten technischen Werkzeugergebnis aus. Der Nutzer wurde
darüber informiert; Werte werden hier nicht wiederholt und wurden nicht in Git
gespeichert. Anschließende Zugriffe verwenden ausschließlich gefilterte
Metadaten-/Ergebnisberichte. Die betroffene CLI-Anmeldung sollte nach Abschluss
erneuert und die alte Sitzung widerrufen werden; diese lokale Anmeldung wurde
im Release nicht stillschweigend verändert.
