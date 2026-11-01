# Zentrale Termin- und Fristerinnerungen

Stand: 01.11.2026. Der Nutzer hat die getrennte Anbindung und Veröffentlichung
in **Firebase Dev** ausdrücklich freigegeben; Produktion und `main` bleiben
unverändert. Die Durchführung und verbleibenden Abnahmegrenzen stehen im
[Dev-Releasebeleg](releases/reminders-dev-2026-11-01-status.md). Die beiden
externen Providerflows sind separat tatsächlich geprüft; dies ersetzt keine
Veröffentlichung des zentralen Firebase-Dienstes in Produktion.

## Quellen und Empfänger

Die explizite Registry in `functions/reminderSources.js` umfasst:

| Quelle | Aktuelle Empfänger |
| --- | --- |
| Persönliche Kalenderereignisse | Aktiver Kalenderbesitzer mit Kalender-Lesezugriff |
| Gemeinsame Kalenderereignisse | Alle aktiven Nutzer mit aktuellem Kalender-Lesezugriff, einschließlich berechtigter Superadmins |
| Haupt-Erinnerung eines To-dos | Aktueller Bearbeiter; solange keiner übernommen hat, der Ersteller |
| Separate To-do-Fristen | Dieselbe Regel wie beim übergeordneten To-do |
| Schäden, Inkasso, Gericht/Streit und Insolvenzen | Die im Vorgang hinterlegte zuständige Person mit aktuellem Modul-Lesezugriff |

Maßgeblich sind aktuelle Nutzer-IDs und die gültige Profil-Mailadresse, keine
in alten Fristen gespeicherte Erstelleradresse. Deaktivierte Nutzer, entzogene
Rechte, fehlende Adresse und fehlende Zuständigkeit blockieren den Versand;
es gibt keinen Ersatzempfänger. Persönliche Kalender erinnern ausschließlich
ihren Besitzer, auch wenn ein Superadmin den Termin lesen kann. Spiegelungen
und virtuelle Fachkalender lösen keinen zweiten Versand aus. Fachfristen
erinnern über ihre Originalquelle, unabhängig vom Kalender-Leserecht.

Die Status-Callable prüft den Zugriff auf jede angeforderte Originalquelle.
Sie liefert Status, Zeitpunkt und Empfängernamen/-IDs, keine Mailadressen oder
Fachtexte. Höchstens 50 Quellen je Aufruf; der Client bündelt Anfragen kurzzeitig
und trennt den Cache nach angemeldetem Nutzer. Das reduzierte Verzeichnis zur
Zuständigkeitswahl erfordert Bearbeitungsrecht im jeweiligen Fachmodul.
Die neue Zuständigkeits-Callable prüft die erwartete bisherige Zuordnung in
einer Transaktion und schreibt Änderung und Verlauf gemeinsam. Bestehende
Schaden-/Inkasso-Editoren dürfen weiterhin eine gültige aktive Zuordnung über
ihren bisherigen, durch Rules geprüften Schreibweg setzen.

## Zeitpunkt und Verpasst-Regel

Alle Eingaben gelten in `Europe/Berlin`. Das Datum und die Uhrzeit werden
explizit gespeichert. Alte To-dos ohne Uhrzeit bleiben anderweitig bearbeitbar,
senden aber erst nach einer ausdrücklich ergänzten Uhrzeit. Es wird keine
Standarduhrzeit erfunden. Nicht existierende Uhrzeiten bei der Zeitumstellung
werden abgelehnt; doppelte Uhrzeiten benötigen die Auswahl erstes/zweites
Vorkommen. Der serverseitige Zeitpunkt verwendet dieselbe reine Zeitlogik wie
die Oberfläche (`shared/reminderTime.js`).

Der Scheduler läuft minütlich. Versand wird nur innerhalb der vorgesehenen
Minute begonnen: `[dueAt, dueAt + 60 Sekunden)`. Verpasst bleibt verpasst, in
Dev und Produktion; Neustart, Erstaufbau oder spätere Reaktivierung holen keine
alten Erinnerungen nach. Das ist eine minutengenaue Versandfreigabe, keine
Garantie für sekundengenaue Scheduler-Ausführung oder Posteingangszustellung.
Ausfälle oder eine überlastete Versandminute können daher Erinnerungen verpassen.

Vor Reservierung und unmittelbar vor dem HTTP-Aufruf werden Quelle,
Zeitpunkt, Zustand, Zuordnung, Nutzeraktivität und Zugriffsrechte erneut geprüft.
Geschlossene bzw. erledigte Vorgänge und zurückgezogene To-dos erinnern nicht.
Gültige zukünftige Arbeitsaufträge bleiben auch bei vorübergehend blockierten
Empfängern erhalten, damit eine rechtzeitige Korrektur vor Fälligkeit wirkt.

## Versand und nachvollziehbare Ergebnisse

Für **Dev und Produktion** fordert der neue Erinnerungsadapter den Absender
`drehpunkt@brennpunkt-logistik.de` an. Die übrigen System-/Tracking-Mailpfade
behalten ihre bisherigen Umgebungsregeln. Die globale automatische Mailpause
gilt weiterhin. Unbekannte Runtime-Projekte sind für diesen Versand gesperrt.

Der aktuelle **Dev-Testmodus** erlaubt ausschließlich die exakte Profiladresse
`no-reply@brennpunkt-logistik.de`. Andere Empfänger werden nicht umgeleitet und
erhalten schon vor der dauerhaften Reservierung bzw. Legacy-Übernahme keinen
Versandbeleg. Der Status zeigt den Dev-Testmodus als Konfigurationsgrund. Die
Prüfung erfolgt erneut mit dem aktuellen Profil unmittelbar vor dem Versand
und zusätzlich im Adapter. Die Produktions-Empfängerlogik bleibt unverändert;
ein Request kann die serverseitige Umgebung oder Freigabe nicht erweitern.

Eine stabile Versand-ID entsteht aus Originalquelle, eindeutigem Zeitpunkt und
Nutzer-ID. Ihre transaktionale Reservierung wird niemals nach einer vermeintlich
abgelaufenen Sperre erneut freigegeben. Parallelität, Wiederholung und verlorene
Antworten dürfen keinen automatischen zweiten Versand erzeugen. Das schützt
vor Doppelversand, kann bei einem Prozessabbruch vor dem HTTP-Aufruf aber auch
einen unklaren, tatsächlich nicht versandten Vorgang hinterlassen.

Der Adapter verwendet das neue, pro Umgebung getrennte serverseitige Secret
`POWER_AUTOMATE_REMINDER_URL` und die zentrale Vorlage `central_reminder`.
Die in Dev veröffentlichte, für Produktion weiterhin nur vorbereitete zertifikatsbasierte Dienstanmeldung verwendet
getrennte `REMINDER_*`-Secrets je Umgebung und einen wiederverwendbaren
Entra-Anmeldebaustein. Ein Token wird nur an den festen Power-Platform-Host des
Mandanten gesendet; SAS-Parameter und anonyme Ersatzaufrufe sind ausgeschlossen.
Nach der Anmeldung werden aktuelle Zuständigkeit, Mailpause und Fälligkeitsminute
erneut vor dem Versand geprüft. Die Cloud-Identitäten und konkreten
Aufruferbindungen wurden getrennt eingerichtet und tatsächlich geprüft;
Details stehen in der [Mailflow-Vorbereitung](reminder-mailflow-preparation.md).
Die bisherigen Fall-/To-do-Fristvorlagen bleiben im
Katalog erhalten; der neue Dienst verwendet sie nicht mehr. Bestehende
individuelle Formulierungen müssen bei einer späteren Umstellung bewusst in
die zentrale Vorlage übernommen werden. Fristbemerkungen bleiben als
Platzhalter enthalten. Der externe Flow muss vor einer späteren Freigabe
folgenden Vertrag erfüllen:

- `from` tatsächlich als autorisierten Absender verwenden; passende
  Postfach-/Send-as-Rechte für `drehpunkt@brennpunkt-logistik.de` sicherstellen.
- Version, feste Projektkennung und Umgebung prüfen. `deliveryId` und den
  projektgebundenen Header `Idempotency-Key` beachten und Wiederholungen ohne
  erneute Mailwirkung behandeln. Absender und Empfänger dürfen nicht aus
  unberechtigten externen Aufrufen übernommen werden.
- Ein eigenes dauerhaftes Provider-Reservierungsverfahren sowie die Prüfung
  von `dueAt` und `expiresAt` direkt vor Outlook verwenden; keine Wiederholung
  der Mailaktion nach unklarem Ausgang.
- Erst nach Annahme durch den Maildienst und gespeicherter Bestätigung mit
  HTTP 200, `accepted: true`, `outcome: "accepted"` sowie passender Version,
  Projektkennung, Umgebung, Versand-ID, Inhaltsfingerabdruck und festem Absender
  antworten. HTTP 202 genügt nicht. Vollständiger Vertrag und lokale Pläne:
  [Mailflow-Prüfung und Vorbereitung](reminder-mailflow-preparation.md).

Ein leeres HTTP 200 oder eine abweichende Bestätigung ist **unklar**, nicht
erfolgreich. Netzwerkverlust/Timeout ebenfalls. Der HTTP-Aufruf wird spätestens
nach zehn Sekunden bzw. am Ende der Minute abgebrochen; ein bereits ausgelöster
externer Versand kann dadurch nicht zurückgenommen werden. Eine Bestätigung
belegt nur die Anbieterannahme, niemals die Zustellung im Posteingang.
Der bestehende externe Flow und seine gebundenen Zugänge wurden inzwischen
lesend geprüft. Absender und Send-as-Rechte sind vorhanden; der Zweiknotenflow
erfüllt den neuen Providervertrag nicht. Zwei gesonderte Abläufe wurden in
Microsoft eingerichtet und mit echten erlaubten Testaufrufen abgenommen.
Die aktuelle Dev-Anbindung bleibt vom unveränderten Produktionsbackend getrennt.

Die Oberfläche unterscheidet unter anderem geplant, Konfiguration erforderlich,
verpasst, unterdrückt, angenommen, teilweise angenommen, fehlgeschlagen und
unklar. Normale Konfigurationslücken sind keine technische Störung. Technische
Fehler laufen begrenzt über das zentrale Diagnosemodul `reminders`, ohne
Mailtexte, Mailadressen, Secret-URLs oder rohe Providerantworten zu protokollieren.

## Arbeitsmenge, Aufbau und spätere Umstellung

`reminderWork` enthält nur fälligkeitssortierbare Arbeitsaufträge;
`reminderDeliveries` die dauerhaften Versandreservierungen/-ergebnisse;
`reminderSourceStatus` die Projektion und `reminderState` Aufbaufortschritte.
Alle vier sind für direkte Clientzugriffe gesperrt, auch für Superadmins.
Der normale Minutentakt liest fällige Jobs statt sämtlicher Facharchive.
Erstaufbau und Parent-Fortsetzungen sind begrenzt und speichern ihren Cursor.
Der zentrale Aufbau in `reminderState/preparation` verarbeitet höchstens 100
Quellen pro Seite, Kalenderereignisse unter ihren Kalendern statt über die
unabhängige Tracking-Ereignisgruppe. Neue Module benötigen eine bewusste
Registry-Erweiterung, Quelle-/Parent-Trigger, Rechte-/Empfängervertrag und Tests.

Vor einer später freigegebenen Umstellung Backend, Callables, Quelltrigger,
Rules, Frontend, Secret/Flow und Datenaufbau zusammen betrachten. Die bestehende
Scheduler-Bezeichnung `scheduledCaseDeadlineReminderDispatch` bleibt erhalten;
ihre Implementierung verwendet den zentralen Dienst. Aufbau über
`prepareReminders` bzw. den kompatiblen Teil von `prepareBackgroundWork`
wiederholt ausführen, bis der neue Marker `complete: true` ist. Nur aktive
Superadmins mit App Check dürfen vorbereiten. Der alte Marker
`backgroundWorkState/deadline-reminders-v1` belegt diese neue Vorbereitung nicht.
Bestehende Versandhistorien bleiben erhalten und werden nicht zurückgesetzt.

Benötigte Functions des neuen Umfangs (keine Ausführungsfreigabe):

- Bestehende Exporte mit neuer Implementierung:
  `scheduledCaseDeadlineReminderDispatch`, `maintainCaseDeadlineReminderWork`
  und der Erinnerungsteil von `prepareBackgroundWork`.
- Neue Quell-/Parent-Exporte: `maintainCalendarEventReminder`,
  `maintainTodoReminders`, `maintainCalendarReminderParent`,
  `maintainDamageReminderParent`, `maintainInkassoReminderParent`,
  `maintainLegalReminderParent`, `maintainInsolvencyReminderParent`.
- Neue Callables: `listReminderStatuses`, `listCaseReminderUsers`,
  `setReminderResponsibility`, `prepareReminders`.
- Dazu die gemeinsame Functions-Zeitlogik, aktualisierte Firestore Rules und
  das gesamte betroffene Kalender-/To-do-/Fachfall-Frontend. Der neue Code
  benötigt keine zusätzlichen zusammengesetzten Indizes; bestehende werden
  nicht entfernt. Das neue Mail-Secret bleibt serverseitig und muss pro Umgebung
  zum passenden, zuvor geprüften Erinnerungsflow passen. Der allgemeine
  Systemmailflow und dessen Secret werden weiter für die übrigen Pfade verwendet.

Während einer freigegebenen Migration automatischen Versand kontrolliert
pausieren, alte/neue Worker nicht gleichzeitig auf dieselbe Versandminute
ansetzen und erst nach vollständigem Aufbau, Providerprüfung und bewusster
Aufhebung der Pause wieder starten. Währenddessen verpasste Termine bleiben
verpasst. Keine automatische rückwirkende Massenmail. Ein Frontend-Rollback
setzt weder Reservationsbelege noch Datenaufbau zurück; Backend und Rules müssen
gemeinsam bewertet werden. Der aktuelle Auftrag erlaubt diese Schritte nur in
Dev; der oben verlinkte Releasebeleg beschreibt den tatsächlichen Stand.

## Lokaler Prüfstand

Lint, Frontend-Build (672 Module), Abgleich der 44 deploybaren Shared-Module
und 86 gezielt ausgewählte Unit-/Vertragstests sind erfolgreich. Zusätzlich
wurden zentrale Verarbeitung, Aufbau mit 501 Altquellen, mehr als 100 parallele
Versandreservierungen, Parent-Fortsetzung, Zuständigkeitskonflikte und
Firestore-Rechte mit simuliertem Versand im lokalen Emulator geprüft.
Die neue Rules-Suite enthält 40 vollständige gewöhnliche Falländerungen;
der bestehende Rules-Vertrag bleibt erfolgreich. Ein vorübergehender Lauf mit
Ausdruckslimitfehlern war bei drei Folgeläufen und diesen gezielten Writes nicht
reproduzierbar. Kein Test wurde in einem echten Firebase-Projekt ausgeführt.

Der isolierte Oberflächen-Prüfaufbau mit geblockten Firebase-Importen lässt sich
bauen. Eine tatsächliche Browserabnahme fand jedoch nicht statt: Die
automatische Sicherheitsprüfung blockierte Computer Use wegen nicht zuverlässig
bestimmbarer Browseradresse. Offen bleiben die realen Abläufe in Deutsch und
Englisch, Light-/Dark-Mode, Speichern/Neuladen, Zuständigkeitskonflikte sowie
DST-Eingaben im Browser. Die spätere lesende Microsoft-Prüfung hat Absender,
Send-as-Recht und beide bestehenden Zielbindungen bestätigt; siehe
[aktueller Nachweis und lokale Provideranpassung](reminder-mailflow-preparation.md).
Offen sind App Check/IAM/Scheduler des neuen Stands im Ziel,
die neuen Providerabläufe mit Idempotenz und eine echte Mailannahme. Dieser
Prüfstand ist keine Veröffentlichungsfreigabe und kein Zustellnachweis.
