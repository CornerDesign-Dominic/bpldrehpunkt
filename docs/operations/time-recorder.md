# Zeiterfassung und Mitarbeiter-PWA

Stand: 14.11.2026. Diese Referenz beschreibt die Zeiterfassung einschließlich
der Korrekturen aus der Rechte- und Zeitkontoabnahme. Die erste Dev-Bereitstellung
und die Ergänzungen für Vorlagen, Dashboard und Handy-Einstieg haben eigene
Prüfbelege. [Dev-Bereitstellung](releases/time-recorder-dev-2026-11-10.md) ·
[Vorlagen, Dashboard und Handy-Einstieg](releases/time-recorder-access-dev-2026-11-10.md).

Die eigenen Web-Fachreiter wurden anschließend auf `dev` ergänzt;
[Bereitstellung und Prüfungen vom 11.11.2026](releases/time-tabs-dev-2026-11-11.md).

## Gemeinsame Grundlage

Drehpunkt und die PWA verwenden dieselbe Firebase Authentication, dieselbe
Firestore-Datenbank `(default)` und dieselben Cloud Functions. Entwicklung
verwendet `db-bpl-drehpunkt-dev`, Produktion `db-bpl-drehpunkt`.
Die mobile Anwendung liegt im separaten Repository
`CornerDesign-Dominic/BPLTimeRecorderMobile`. Das zweite Repository benötigt keine zweite Datenbank und
keine zweite Benutzerverwaltung. Die Anmeldung muss pro Browser/Origin erfolgen;
gleiche Zugangsdaten bedeuten keine automatisch geteilte Browsersitzung.

Zeitdaten sind eigene Collections: `timeWorkModels`, `timeAccounts`, `timeDays`,
`timeHistory`, `timeWorkModelTemplates` und `timeWorkModelTemplateNames`.
Die Buchungs-Deduplizierung verwendet `timeHistory`. Browserzugriffe auf diese
Collections werden selbst für Superadmins verweigert. Die Callables prüfen
Firebase-Anmeldung, aktives Profil und fachliche Berechtigung; App Check ist
für die Zeit-Callables aktiviert.
Arbeitszeitberechnung ist in `shared/timeTracking.js` zentral definiert;
`functions/shared` ist die durch das vorhandene Sync-Skript erzeugte Deploykopie.

## Rollen

- Mitarbeiter mit `timeTracking: view` sehen eigene Zeitdaten. `edit` erlaubt
  Stempeln sowie eigene Nachträge/Korrekturen für heute und die letzten sieben
  Berliner Kalendertage. Ältere Zeiten ändern zuständige Zeitmanager/Superadmins.
- Nur Superadmins vergeben `timeManager`, `timeManagerAllDepartments` und
  `timeManagerDepartments` im Admincenter. Urlaubsmanager sind unabhängig davon.
  Adminrolle oder Personalrecht allein gewähren keine Zeitmanager-Zuständigkeit.
- Zeitmanager bearbeiten andere Personen ihrer zugewiesenen Abteilungen.
  Eigene Zeiten laufen über **Meine Arbeitszeit** und brauchen weiterhin das
  eigene Modulrecht; das Zeitmanagerrecht verlängert die persönliche
  Korrekturfrist nicht. Superadmins können auch eigene ältere Tage korrigieren.
- Arbeitszeitmodelle pflegen ausschließlich Superadmins. Mit eigenem
  Zeit-Leserecht können Mitarbeiter ihre eigenen Gültigkeitszeiträume,
  Sollstunden, Pausenregeln und die wirksame Feiertagsregion ansehen.
  Zeitmanager erhalten darüber keinen Zugriff auf fremde Modelle.
  Administrative Modellfelder und Modelländerungsverläufe bleiben privat.
- Personal-Auswertungen und die Krankheitserfassung sind ein späterer Umfang.
  Keine Krankmeldefunktion in der PWA.

| Vorgang | Berechtigung |
| --- | --- |
| Eigene Zeitübersicht, Zeitkonto und Verlauf | Zeiterfassung ansehen oder bearbeiten |
| Eigenes Arbeitszeitmodell mit aktuellen, künftigen und früheren Zeiträumen ansehen | Zeiterfassung ansehen oder bearbeiten |
| Eigene Stempel, Korrekturen und Nachträge | Zeiterfassung bearbeiten; Frist und Korrekturgrund siehe unten |
| Fremde Zeiten im Drehpunkt-Web prüfen oder korrigieren | Zugewiesener Zeitmanager oder Superadmin |
| Arbeitszeitmodell, Vorlage und Anfangssaldo einrichten | Nur aktiver Superadmin |
| Anfangsstand, Gesamtsaldo und Überstundenabbau im Personalbereich ansehen | Personal ansehen oder bearbeiten; keine Rohstempel oder Modelle |
| Eigene Anträge und Urlaubsübersicht in der PWA | Urlaub ansehen oder bearbeiten |
| Eigene Urlaubsanträge stellen, überarbeiten oder ausstehende Anträge zurückziehen | Urlaub bearbeiten; keine selbstständige Rücknahme bereits genehmigter Anträge |
| Urlaubsanträge genehmigen oder ablehnen | Zuständiger Urlaubsmanager oder Superadmin, über Drehpunkt-Web |

Ein aktives Superadmin-Profil hat die Modulrechte. Deaktivierte und nicht
freigegebene Profile bleiben auch mit hinterlegter Rolle gesperrt.

## Arbeitszeitmodelle und Zeitkonto

Aktive Superadmins können Stunden, Pausenstufen und Feiertagsregion im Editor
unter **Als Vorlage speichern** benennen und später als bearbeitbare Kopie
übernehmen. Mitarbeiter, Gültigkeitsdaten und Anfangssaldo werden nicht in der
Vorlage gespeichert oder bei der Übernahme ersetzt. Unter **Vorlagen verwalten**
lassen sich Vorlagen bearbeiten und archivieren. Änderungen wirken nur auf
künftige Übernahmen. **Montag auf Dienstag–Freitag übernehmen** ist eine
zusätzliche Kopierhilfe im Entwurf.

Die drei Callables `listTimeWorkModelTemplates`, `saveTimeWorkModelTemplate` und
`archiveTimeWorkModelTemplate` prüfen aktive Superadminrechte. Vorlagen,
Änderungshistorie und Namenssperren sind für direkte Clientzugriffe gesperrt.

Je Mitarbeiter sind beliebig viele aufeinanderfolgende Modellzeiträume vorgesehen:
`validFrom`, `validTo` (inklusive, leer bedeutet offen). Zeiträume dürfen sich
nicht überschneiden. Je Wochentag existieren Sollminuten und Pausenstufen.
Eine neue Modellperiode verändert vorherige Perioden nicht. Explizite Änderungen
durch Superadmins werden protokolliert.

Das Konto besitzt Startdatum und Anfangssaldo in Minuten, normalerweise null.
Übernommene Plus-/Minusstunden aus dem vorherigen System werden als Anfangssaldo
eingetragen. Der Gesamtsaldo summiert nur abrechenbare Tage ab dem Startdatum
bis einschließlich heute. Fehlende Modellzeiträume und offene vergangene Tage
machen ihn vorläufig. Auf freien Tagen mit einem gültigen Modell zählt
geleistete Arbeit vollständig als Pluszeit nach den für den Tag hinterlegten
Pausenregeln. Die Wochen-Sollzeit ergibt sich aus den Tagessollzeiten.

Genehmigter Überstundenabbau (`vacationType: overtime`) wird getrennt vom
Urlaubsanspruch als Zeitkonto-Abzug ausgewiesen. Grundlage sind die normalen
Sollminuten des jeweiligen Tages; halber Abbau verwendet die Hälfte, Feiertage
und ohnehin freie Tage erzeugen keinen Abzug. Der freie Anteil reduziert die
angezeigte Sollzeit wie Urlaub; `overtimeDebitMinutes` wird zusätzlich im Saldo
berücksichtigt. `overtimeRequestIds` verweisen auf die dauerhaft gespeicherten
genehmigten Originalanträge, neue Genehmigungen kennzeichnet der Server mit
`timeAccountEffect: overtime_debit`. Genehmigte Änderungsanträge werden nicht
zusätzlich zum aktualisierten Original gezählt. Nach Stornierung entfällt der
Abzug bei Neuberechnung.

Mitarbeiter und Zeitmanager sehen den Abzug in ihrer Tages-/Monatsübersicht.
Der Personalbereich erhält mit `personnelOnly: true` ausschließlich Kontosaldo,
Anfangsstand und datumsbezogene Abbaubelege. Dieses Leserecht gewährt weder
Zeitmanagerrechte noch Zugang zu Rohstempeln, Arbeitszeitmodellen oder
Korrekturverläufen. Größere Personal-Auswertungen bleiben ein späterer Umfang.

Der Drehpunkt-Feiertagskalender ist die Basis. Die konfigurierte Betriebsregion
ist zu berücksichtigen; ausländische oder nicht zutreffende regionale Feiertage
dürfen nicht pauschal Sollstunden entfernen. Genehmigter ganztägiger Urlaub und
zutreffende Feiertage setzen die Sollzeit auf null. Halber Urlaub halbiert die
Sollzeit, hebt aber arbeitsdauerabhängige Pausenregeln nicht auf.
Explizit mit null Tagen genehmigte Anträge ändern weder Sollzeit noch Zeitkonto.

Neue mehrtägige Anträge mit halbem Urlaubstag benötigen `halfDayDate`. Historische
Anträge mit z.B. 2,5 Tagen ohne Tageszuordnung sind fachlich nicht eindeutig und
müssen sichtbar zur Klärung markiert werden. Der bestehende Urlaubsbestand wird
nicht automatisch umgeschrieben.

Urlaubsanträge aus Browser und PWA dürfen nur die Felder für einen ausstehenden
Antrag schreiben. Genehmigung, Bearbeiter und Kontowirkung setzt der Server.
Änderungs- und Stornoantrag müssen auf denselben eigenen genehmigten Originalantrag
verweisen. Ein genehmigter Abbau kann nur über den genehmigten Stornoweg aufgehoben
werden.

## Stempelbuchungen und Pausen

### Eigene Arbeitszeit im Drehpunkt-Web

Unter dem heutigen Stempelbereich stehen die Fachreiter **Aktuelle Woche**
(Standard, Montag bis Sonntag), **Monatsübersicht** (Tageswerte des ausgewählten
Monats als Tabelle), **Alle Buchungen** und **Mein Arbeitszeitmodell**. Die Monatstabelle enthält ausschließlich
Tag, Sollzeit, Istzeit, Pause gesamt, Arbeitszeit und Plus/Minus. Istzeit ist die
erfasste Anwesenheit einschließlich gebuchter Pausen; Pause gesamt addiert gebuchte
und automatisch abgezogene Pausen; Arbeitszeit entspricht der angerechneten
Zeit nach Pausenabzug. Tagesbuchungen, Korrekturknöpfe und Einzelhinweise stehen
weiterhin in der Wochenansicht. Nicht berechenbare oder unvollständige Salden
werden nicht als bestätigtes Plus/Minus angezeigt. Der heutige Stempelbereich und die
Wochenwerte bleiben auch beim Anzeigen eines anderen Monats aktuell. Die
Zeitmanageransicht und die mobile Oberfläche behalten ihren bisherigen Aufbau.

**Aktuelle Woche** zeigt Montag bis Sonntag als sieben nebeneinanderstehende
Tagesbalken mit gemeinsamer Höhenskala. Der blaue Balken ist direkt mit
Arbeitszeit und der nach Pausenabzug angerechneten Dauer beschriftet. An der
gestrichelten Linie stehen Soll und die angepasste Tagessollzeit. Die gelbe
Erweiterung des Balkens zeigt ausschließlich gebuchte Pause. Unter dem
Diagramm stehen Auf Arbeit (erfasste Arbeitsdauer plus gebuchte Pause), Pause
und Tagessaldo. Fehlende Vorgaben erscheinen als Soll — und Erfasst statt
einer vermeintlich berechneten Arbeitszeit. Der heutige Tag ist hervorgehoben.

Jede der drei Tagesangaben hat einen per Klick, Touch oder Tastatur erreichbaren
Info-Button. Das Dialogfenster zeigt Anwesenheit minus genommene Pause minus
automatischen Zusatzabzug gleich angerechnete Arbeit. Danach werden die
angepasste Sollzeit und gegebenenfalls genehmigter Überstundenabbau abgezogen.
Unvollständige, nicht berechenbare oder zukünftige Tage erhalten keinen
bestätigten Saldo. Ein laufender heutiger Tag wird in der Rechnung als vorläufig
gekennzeichnet. Die angezeigten Werte stammen aus dem zuletzt geladenen
Workspace. Der Dialog verändert keine Buchungen.

Der Fachreiter Mein Arbeitszeitmodell zeigt den aktuell gültigen Zeitraum
aufgeklappt, künftige und frühere Zeiträume zum Aufklappen sowie je Zeitraum
die Wochensollzeit, Feiertagsregion und eine Tabelle für Montag bis Sonntag mit
Tagessoll und Pausenstufen. Jede Stufe benennt Arbeitsdauergrenze und erforderliche
Gesamtpause. Die Erläuterung beschreibt den schrittweisen Abzug und die Anrechnung
gebuchter Pausen. Es gibt einen Aktualisieren-Button; Änderungen erfolgen über
die bestehende Superadmin-Verwaltung.

Pro Tag folgt darunter eine kleine Tabelle ausschließlich mit Stempelzeit und
Aktion, chronologisch nach dem Ereigniszeitpunkt sortiert. Ein Stift an der Buchung
öffnet das bestehende Einzelkorrektur-Modal. Zukunftstage, fehlendes Schreibrecht
und nicht verfügbare Verbindung/Daten sperren die Bearbeitung wie bisher.
Unvollständige Tage bleiben erkennbar; keine Änderung an Zeitberechnung oder
Korrekturfrist. Bei schmalem Fenster bleibt die Siebentagesansicht horizontal
scrollbar, statt Tage auszublenden. Die ausführliche Zeitmanager-Tabelle bleibt
unverändert.

**Alle Buchungen** ist unabhängig von der Monatsauswahl. Eine Hauptzeile entspricht
einer stabilen Buchungs-ID und zeigt den aktuell gültigen Stand. Die neun
Spalten sind Datum, Uhrzeit, Buchung, Erfassung, Über, Bearbeiter, Gespeichert am,
Grund und Verlauf. Bearbeiter ist auf 150 Pixel begrenzt; die Grund-Spalte nutzt
den frei werdenden Platz. Der Grund ist direkt lesbar, ein zusätzlicher
Freitexthinweis bleibt aufklappbar. Erfassung ist schlichter Text: Gestempelt, Manueller Nachtrag oder
Korrektur. Gelöschte Buchungen bleiben mit ihrer letzten Uhrzeit/Aktion und
Erfassung Gelöscht erhalten. Historisch nicht belegte Angaben bleiben ausdrücklich
nicht erfasst. Die Bezeichnung Original, Statusabzeichen und die Vorher-Spalte
entfallen.

Der Verlauf klappt frühere effektive Stände direkt unter der Hauptzeile als
kompakte Tabellenzeilen mit denselben neun Spalten auf, neuester zuerst bis zur
ersten Erfassung. Die Unterzeilen sind mit einem deutlich kontrastierenden, themeabhängig
helleren beziehungsweise dunkleren Hintergrund abgesetzt und eingerückt; nur
geänderte Werte werden hervorgehoben. 30 Stände bedeuten eine aktuelle Zeile und
29 frühere Zeilen. Jeder Stand behält seinen gespeicherten Bearbeiter, Zeitpunkt
und Erfassungsweg. Der Grund ist je Stand direkt in seiner eigenen Spalte
lesbar; längere Freitexthinweise lassen sich dort bei Bedarf öffnen.

Speicherungen ohne Änderung von Aktion/Zeitpunkt zählen nicht als weitere
Version. Sie bleiben als Unverändert gespeichert separat aufklappbar erhalten
und ersetzen nicht den Urheber des gültigen Standes. Ohne frühere Stände oder
zusätzliche Speicherungen bleibt die Verlaufsspalte leer. Für einen aus der
Vorher-Evidenz rekonstruierten ersten Stand wird kein historischer Bearbeiter
erfunden. Unbekannte Geräteherkunft bleibt ebenfalls ausdrücklich nicht erfasst.

`listOwnTimeBookings({before?})` prüft aktives Profil und eigenes Zeit-Leserecht.
Die Zielperson ist ausschließlich die authentifizierte UID. Die Abfrage lädt
30 gespeicherte Tage je Seite einschließlich ihrer vollständigen Stempel- und
Korrekturhistorie; `nextBefore` ermöglicht das Laden älterer Tage. Sie nutzt den
Index `timeDays: userId ASC, date DESC` und gibt keine Modelle oder Personaldaten
zurück. Die bisherige 500-Einträge-Grenze der Workspace-Korrekturübersicht
begrenzt diesen Buchungsverlauf nicht.

Neue Web-Anfragen übergeben `client: web`. Die bestehende mobile Dev-App wird
an ihren beiden exakten Firebase-Hosting-Origins erkannt; ihr Quellcode bleibt
unverändert. Bei neuen Nachträgen und Änderungen wird die Herkunft gespeichert;
unveränderte Ereignisse behalten ihre ursprüngliche Herkunft. Neue
Historieneinträge speichern zusätzlich den Bearbeiternamen. Historische
Bearbeiternamen werden, soweit möglich, aus dem aktuellen Benutzerprofil
aufgelöst. Ohne gespeicherte Geräteherkunft erscheint **Nicht erfasst**;
historische Live-/Offline-Angaben werden nicht nachträglich als Web/Handy geraten.

Ereignisse: `come`, `pause_start`, `pause_end`, `go`. Mehrere Arbeitsabschnitte pro
Tag sind möglich. Arbeitsdauer ist die Summe der Arbeitsabschnitte, ohne gebuchte
Pausen und vor zusätzlichem automatischem Pausenabzug. Dauern werden anhand der
tatsächlich verstrichenen Zeit berechnet; Kalendertage sind `Europe/Berlin`.

Eine Pausenstufe beschreibt die erforderliche **Gesamtpause**, keine weitere
zusätzliche Pause. Fehlende Pause wird beim Überschreiten der Grenze schrittweise
abgezogen. Beispiel mit 6h/30min und 9h/45min ohne gebuchte Pause:

| Arbeitsdauer | Zusätzlicher Abzug |
| --- | --- |
| 6:00 | 0 Minuten |
| 6:01 | 1 Minute |
| 6:30 | 30 Minuten |
| 9:01 | 31 Minuten |
| 9:15 | 45 Minuten |

Gebuchte Pausen werden angerechnet, nicht doppelt abgezogen. Rohbuchungen,
gebuchte Pausen, rechnerischer Abzug und angerechnete Arbeitszeit bleiben getrennt.
Bei Korrekturen wird neu berechnet. Auch eng gesetzte Stufen erzeugen keinen
Sprung: Liegen die Grenzen bei 6:00 und 6:05, wächst der automatische Abzug
ohne gebuchte Pause von 5 Minuten bei 6:05 auf 6 Minuten bei 6:06.

Ein fehlender Feierabend erzeugt keine über Nacht laufende Arbeitszeit. Der Tag
bleibt unvollständig. Ein neuer Arbeitstag kann trotzdem sofort begonnen werden;
anschließend weist die Oberfläche auf den fehlenden Abschluss hin.

Nachträge und Korrekturen gelten sofort. Grundauswahl ist Pflicht, Freitext
optional. Vorher-/Nachher-Werte, Akteur, Zeitpunkt und Quelle bleiben in der
serverseitigen Historie erhalten. Echtzeit-, Offline- und manuelle Buchungen
werden unterschieden.

## PWA und Offlineverhalten

### Einstieg und Installation

Auf dem Dashboard steht für berechtigte Mitarbeiter eine Kachel zum Stempeln
und zum Anzeigen des heutigen Status bereit. Die Kachel verwendet dieselben
Buchungsfunktionen wie die eigene Zeitseite. Über **Am Handy öffnen** lässt
sich ein QR-Code zur konfigurierten PWA-Adresse anzeigen. Der gleiche Einstieg
steht auf `/zeiterfassung`. In der PWA führt **Konto → Auf dem Startbildschirm**
durch die Installation auf dem jeweiligen Gerät.

Im Drehpunkt-Web-Build kann optional `VITE_TIME_PWA_URL` auf die veröffentlichte
HTTPS-Adresse von `BPLTimeRecorderMobile` gesetzt werden. Die Variable bleibt in
`.env.example` bewusst leer; sie ist eine öffentliche Zieladresse und darf keine
Zugangsdaten enthalten. Änderungen benötigen einen neuen Web-Build. Ohne gültige
Adresse erscheint kein Link. HTTP wird ausschließlich in lokalen Vite-Dev-Builds
für `localhost`, `127.0.0.1` oder `[::1]` akzeptiert.

Auf der eigenen Seite `/zeiterfassung` öffnet **Mobile App öffnen** die PWA in
einem neuen Tab. Auf dem Mobilgerät kann sie anschließend über das Browsermenü
mit **App installieren** beziehungsweise **Zum Home-Bildschirm** installiert
werden. Für die erste Anmeldung und das Bereitstellen der Offline-App-Hülle ist
eine Internetverbindung erforderlich. Der Link legt keine Hosting-Umgebung an
und ändert weder Firebase-Projekt noch Anmeldung.

### Funktionen und lokale Speicherung

Die PWA bietet Stempeln, eigene Tages-/Wochen-/Monatsübersichten, Kontosaldo,
Zeitkorrekturen und die bestehenden persönlichen Urlaubsabläufe. Keine
Verwaltungsfunktionen, fremden Mitarbeiterdaten oder Push-Erinnerungen.

Nur Stempelereignisse dürfen offline gespeichert werden. Eine dauerhafte lokale,
nach UID getrennte Warteschlange speichert eindeutige Ereignis-IDs. Übertragung
erfolgt bei wiederhergestellter Verbindung und erneutem Öffnen. Neue Offline-
Stempel werden für heute und die vergangenen sieben Berliner Kalendertage
angenommen. Danach bleibt der Beleg zur Klärung auf dem Gerät; bereits angenommene
identische Buchungen können weiterhin als Duplikat bestätigt werden. Offline-Zeit
ist die erfasste Gerätezeit; Gerätezeit und Serverempfang sind im Nachweis getrennt.
Fehler und Konflikte bleiben sichtbar. Noch ausstehende Ereignisse werden nicht
unter einem anderen angemeldeten Benutzer gesendet.
Bei einem Verbindungsabbruch zwischen Serverbestätigung und Übersichtsabgleich
bleibt ein bestätigter Stempel des laufenden Tages sichtbar. Er wird nicht erneut
gesendet; ein ausreichend aktueller Serverstand ersetzt den lokalen Beleg.

Stempel- und Korrekturanfragen enthalten außerdem `expectedUserId` als erwartete
Akteursidentität. Der Server vergleicht diese mit der authentifizierten UID;
ein Kontowechsel während App Check oder einer Übertragung darf keine Aktion
unter dem neuen Konto auslösen. Ein Konflikt blockiert nur die übrigen Ereignisse
seines Tages. Nach ausdrücklicher Klärung kann ein lokaler Beleg archiviert
werden, wobei der ursprüngliche Beleg auf dem Gerät erhalten bleibt.

Urlaub und Zeitkorrekturen benötigen Internet. Der Service Worker speichert die
Anwendungshülle, keine Firebase-Antworten oder fremden Personaldaten. Die App
speichert eigene Zeitübersicht, Rechte und Warteschlange getrennt nach UID in
IndexedDB. Sobald ein Rechteentzug online erkannt wurde, darf eine verspätete
Antwort den lokalen Zugriff nicht wieder freigeben. Rechteänderungen auf dem
Server kann ein vollständig offline befindliches Gerät erst nach dem
Wiederverbinden erkennen. Lokal gespeichert und serverseitig bestätigt werden
klar unterschieden.

## Daten- und Callable-Vertrag

### Separater Dev-Web-Testzugang

Für die neuen Drehpunkt-Zeitseiten kann zusätzlich die Firebase-Hosting-Site
`db-bpl-drehpunkt-dev-web-time` im Projekt `db-bpl-drehpunkt-dev` verwendet werden.
Die additive Konfiguration `firebase.time-dev.json` ändert weder die bestehende
`firebase.json` noch vorhandene Vercel-Hosts. Ihr Predeploy-Hook führt
`node scripts/build-time-web-dev.mjs` aus. Der Build liest Vite-Einstellungen im
Modus `development` und bricht ab, wenn das tatsächlich wirksame Firebase-Projekt
nicht exakt `db-bpl-drehpunkt-dev` ist; Prozessvariablen haben dabei wie in Vite
Vorrang vor Dotenv-Dateien. Das öffentliche `firebase-target.json` dokumentiert
nur Projekt-ID, App-ID und Buildzeit, keine Schlüssel oder Anmeldedaten.

Die Web-Testsite benötigt eine autorisierte Firebase-Auth-Domain und eine passende
App-Check-Registrierung. `VITE_TIME_PWA_URL` kann im Dev-Build auf die separate
mobile Dev-Site zeigen. Der gezielte Hosting-Befehl lautet:

```powershell
firebase deploy --config firebase.time-dev.json --only hosting --project db-bpl-drehpunkt-dev
```

Dieser Befehl ist vom Backend-Deploy getrennt. Er erstellt die Site nicht und
bestätigt keine erfolgte Veröffentlichung; Site-Erstellung und tatsächlicher
Deploynachweis gehören in den jeweiligen Dev-Prüfstand. Alle HTML-/SPA-Antworten
der Testsite werden mit `Cache-Control: no-cache, no-store, must-revalidate`
ausgeliefert, damit Prüfer jeweils den aktuellen Entwicklungsstand erhalten.

- `timeWorkModels/{id}`: `userId`, `validFrom`, `validTo`,
  `weekdays[0..6].targetMinutes`, `weekdays[0..6].breaks` mit
  `afterMinutes`/`requiredMinutes`, optionale Feiertagsregion und Änderungsakteur.
- `timeAccounts/{uid}`: `startDate`, `openingBalanceMinutes` und serverseitige
  Modellrevision. Konto- und Modelländerungen werden historisiert.
- `timeDays/{uid_YYYY-MM-DD}`: `userId`, `date`, `events`, `revision` und
  Serveränderungszeit. Ereignisse besitzen stabile `id`, `type`, `at`, `source`
  und bei Stempelbuchungen `receivedAt`. Unveränderte Ereignisse behalten bei
  einer Tageskorrektur ihre ursprüngliche Quelle und Empfangszeit.
- `timeHistory/{id}`: unveränderliche Stempel-, Korrektur-, Konto- und
  Modellnachweise. Stempel-IDs sind ein Hash aus UID und Ereignis-ID; dieselbe
  Übertragung darf weder doppelt buchen noch einem anderen Konto zugeordnet
  werden. Korrekturen enthalten Vorher-/Nachher-Werte, Grund und Akteur.

`listTimeWorkspace({userId?, from?, to?})` liefert Tagesberechnungen, Anfangssaldo,
Gesamtsaldo und `balanceProvisional`. `ownOnly: true` erzwingt eigene Daten und
unterdrückt Modelle und fremde Mitarbeiter auch bei privilegierten Konten.
`managed: true` wählt beim ersten Aufruf ohne Mitarbeiter-ID die erste Person der
zugewiesenen Abteilungen. Diese Optionen sind getrennte Ansichten.

`personnelOnly: true` verlangt das Personal-Leserecht und liefert nur `user`,
`account`, `balanceMinutes`, `balanceProvisional` und je Tag `date`,
`overtimeDebitMinutes`, `overtimeRequestIds`, `calculationIncomplete`. Es gewährt
keinen Zugriff auf Modelle, Stempelereignisse oder Korrekturverläufe und kann
nicht mit `ownOnly`/`managed` kombiniert werden.

`getOwnTimeWorkModels()` verlangt App Check, Anmeldung, aktives Profil und eigenes
Zeit-Leserecht. Die serverseitige Abfrage verwendet ausschließlich die
authentifizierte UID. Eine abweichende Ziel-UID wird auch für Superadmins
abgewiesen. Die Ausgabe enthält nur Gültigkeitsdaten, Sollminuten und Pausenstufen
je Wochentag sowie die gemäß derselben Fallback-Regel wie in der Tagesberechnung
wirksame Feiertagsregion. Dokument-IDs, User-IDs, Bearbeiter, administrative Felder,
Vorlagen und Änderungshistorien werden nicht ausgeliefert. Die bisherigen
Workspace-Projektionen und direkten Firestore-Rechte bleiben bestehen.

Tageswerte unterscheiden `workedMinutes`, `bookedBreakMinutes`,
`automaticBreakMinutes`, `creditedMinutes`, `targetMinutes` und
`overtimeDebitMinutes`. Die Abweichung ist angerechnete Arbeitszeit minus
angepasste Sollzeit minus Überstundenabbau. `overtimeRequestIds` verweist auf
gespeicherte wirksame ursprüngliche Urlaubsanträge; genehmigte Änderungs- und
Storno-Unteranträge werden nicht nochmals als Abwesenheit gezählt. Zukünftiger
Überstundenabbau kann in Tagesübersichten erscheinen, belastet den Gesamtsaldo
jedoch erst am betreffenden Tag. Stornierungen nehmen diese rechnerische Wirkung
automatisch zurück, ohne eine zweite Gegenbuchung zu erzeugen.

`incomplete` bezeichnet offene/ungültige Stempelabläufe, `calculationIncomplete`
fehlende Modelle oder unklare historische Halbtagzuordnungen. Solche Tage bleiben
im Gesamtsaldo unberücksichtigt; `balanceProvisional` kennzeichnet dies sichtbar.
`unresolvedDays` enthält bis zu 30 vergangene unvollständige Stempeltage auch
außerhalb des angezeigten Monats.

`stampTime` verlangt `expectedUserId`, `eventId`, `type`, `at`, `offline`.
`correctTimeDay` verlangt `expectedUserId`, gegebenenfalls abweichendes Ziel
`userId`, `date`, `expectedRevision`, `events`, `reason` und optional `note`.
Ein veralteter Tagesstand wird abgewiesen; der Benutzer muss vor einer erneuten
Korrektur neu laden. Modelle und Anfangssalden werden ausschließlich über
`saveTimeWorkModel` und `saveTimeAccount` von aktiven Superadmins gespeichert.

Die erste Implementierung berechnet den Kontoverlauf aus den Tagesdaten neu.
Korrekturverläufe sind auf 500 Einträge begrenzt und benötigen den neuen
`timeHistory`-Verbundindex; Feiertagsabfragen sind auf relevante Länder begrenzt.
Bei wachsendem Datenbestand sind serverseitige Monatsabschlüsse beziehungsweise
Summenprojektionen zu prüfen, ohne die ursprünglichen Nachweise zu ersetzen.

## Abnahme vom 10.11.2026

| Prüfung | Ergebnis und Abdeckung |
| --- | --- |
| Drehpunkt: gezielte Node-Tests | 59 bestanden. Zeitberechnung, Pause und Sommerzeit, Rechte, Dashboard, Vorlagen, Urlaubslogik und Schutz der Dev-Bereitstellung. |
| Firestore-Emulator | 23 bestanden, keine übersprungen. Darunter 10 Rechte- und 6 Kontotests; die übrigen 7 prüfen bestehende Vertrags- und Firestore-Regeln. |
| Rechte im Emulator | Eigene und fremde Zeiten; Lesen/Bearbeiten; andere Abteilungen; Zeit- und Urlaubsmanager unabhängig; Admin, Superadmin, Personal, gesperrte Profile; direkte Firestore-Zugriffe und manipulierte Urlaubsstatus bzw. Verknüpfungen werden verweigert. |
| Konto im Emulator | Startsaldo in beiden Vorzeichen, Modellwechsel und Überschneidung, gebuchte und zusätzliche Pausen, freier Tag, Feiertagsregion, halber und ganzer Urlaub, Null-Tage-Anträge, Überstundenabbau mit Genehmigung, Änderung und Storno, fehlendes Modell und fehlender Feierabend. |
| Buchungen im Emulator | Gleichzeitig gesendete gleiche IDs, abgelaufene Offlinebuchung, veraltete Revision, Korrekturgrund und unveränderliche Nachweise. |
| Drehpunkt: statische Prüfung | `npm run lint`, `npm run build`, `npm run check:functions-shared` erfolgreich; 48 gemeinsame Module stimmen mit der Deploykopie überein. |
| PWA: statische Prüfung und Node-Tests | `npm run lint`, `npm test` (19 bestanden) und `npm run build:dev` erfolgreich. Geprüft sind u. a. Rechteentzug, getrennte Konten, parallele Übertragung und Offline-Warteschlange. |
| PWA in lokalem Chrome | Gebauter Service Worker installiert; App nach Offline-Neustart geladen; wartender und synthetisch bestätigter Stempel bleiben sichtbar. Urlaub und Korrekturen sind offline gesperrt. |

Die Integrationstests verwenden ein lokales Demo-Projekt. Die Rules wurden
über den Firestore-Client mit Testidentitäten angesprochen; die Callables
wurden über ihre echten Handler gegen den Emulator ausgeführt. Der Lauf prüft
keine echte Firebase-Anmeldung oder App-Check-Tokens über HTTP. Der lokale
Chrome-Test verwendete synthetische Profildaten. Es wurden keine Cloud-Konten
oder Buchungen angelegt.

Wiederholbar mit installiertem Java 21 und Firebase CLI:

```powershell
firebase emulators:exec --only firestore --project demo-drehpunkt-time "node --test --test-concurrency=1 functions/timeTracking.rights.integration.test.js functions/timeTracking.account.integration.test.js functions/contracts.rules.integration.test.js functions/costEfficiency.rules.integration.test.js"
```

Die beiden Fachsuiten liegen in
[timeTracking.rights.integration.test.js](../../functions/timeTracking.rights.integration.test.js)
und [timeTracking.account.integration.test.js](../../functions/timeTracking.account.integration.test.js).

## Release und Kollegentest

1. Für einen Webrelease auf `main` zuerst den Verbundindex für
   `timeHistory` (`userId ASC`, `kind ASC`, `createdAt DESC`) in
   Firebase Produktion anlegen und seinen Aufbau abwarten. Die neun
   Callables aus `timeTracking.js` und `timeWorkModelTemplates.js`, die
   aktualisierten Regeln sowie
   `listManagedUsers`, `createManagedUser`, `updateManagedUser`,
   `processVacationRequest`, `replacePendingVacationRequest` und
   `withdrawVacationRequest` gezielt bereitstellen und prüfen. Dann Web
   gemäß [Release-Runbook](releases.md) übernehmen.
2. Im Zielsystem pro Pilotkonto Zeiterfassung auf **Bearbeiten** setzen,
   Arbeitszeitmodell und Startdatum prüfen und einen gewünschten Anfangssaldo
   eintragen. Zeitmanager und Urlaubsmanager getrennt und mit passender
   Abteilung einrichten. Dev-Zeitdaten werden nicht nach Produktion kopiert.
3. Für einen mobilen Produktionstest braucht das separate PWA-Repository
   einen veröffentlichten Produktions-Build, eine für Firebase Auth und
   App Check eingerichtete Hosting-Domain und die passende
   `VITE_TIME_PWA_URL` im Drehpunkt-Web-Build. Ein Merge im Web-Repository
   veröffentlicht keine PWA. Für die beiden Umgebungen gibt es getrennte URLs.
   [Mobile App Produktion](https://db-bpl-drehpunkt-time.web.app) ·
   [Mobile App Dev](https://db-bpl-drehpunkt-dev-time.web.app).
4. Beim Handytest in der installierten PWA offline stempeln, App schließen
   und wieder öffnen, dann wieder verbinden. In Drehpunkt dieselbe Buchung
   genau einmal sehen. Urlaub und Nachträge sind erst online wieder verfügbar.
   Der physische Gerätetest und der Abgleich mit einem Pilotkonto ergänzen
   den lokalen Chrome- und Emulatorlauf.

## Einzelbuchungen aus dem Sammelstand (Dev-Freigabe 12.11.2026)

Der zunächst unveröffentlichte Umfang wird auf ausdrücklichen Folgeauftrag
zusammen mit den Karten- und Listenanpassungen auf Dev bereitgestellt. Die Oberfläche
setzt einen Stift direkt an jede Buchung und Buchung hinzufügen unter jede
Tagesliste. Jede Aktion öffnet ein kompaktes Einzelmodal mit eigenem Grund und
optionalem Hinweis. Ein Nachtrag erhält eine stabile neue Ereignis-ID.

Der Mülleimer im Einzelmodal öffnet eine gesonderte Bestätigung mit dem
ursprünglichen Buchungszeitpunkt und eigener verpflichtender Löschbegründung.
Abbrechen und fehlender Grund erzeugen keine Änderung. Im Zeitmanagerbereich
und beim Hinweis auf unvollständige Tage führt die Tagesauswahl zunächst zu
einer kompakten Leseliste mit Einzelstiften und Nachtragsknopf.

Die bestehende Callable correctTimeDay bleibt bestehen: Gesendet wird die
vollständige aktuelle Tagesliste, aber ausschließlich ein ausgewähltes Ereignis
wird verändert, ergänzt oder entfernt. Unberührte Zeitpunkte einschließlich
Sekunden bleiben erhalten. Jede Aktion hat ihren eigenen Grund in der Historie.
Serverseitige Tagesfolgenprüfung und Korrekturfrist werden nicht umgangen;
Korrekturen, die nur gemeinsam eine gültige Tagesfolge ergeben, können dadurch
weiterhin nicht als ungültige Einzelschritte gespeichert werden.

Revision und beim Öffnen erfasste Akteurs-UID sichern die Anfrage ab. Bei einem
Konflikt muss der Benutzer explizit neu laden; Eingaben werden verworfen. Eine
inzwischen gelöschte Zielbuchung wird nicht neu erzeugt. Nach bestätigtem
Speichern und anschließend fehlgeschlagenem Nachladen ist nur erneutes Laden
möglich, kein wiederholtes Schreiben. Handy-App und Produktion unverändert.

## Eigene Übersichtsseite und Buchungssuche (12.11.2026)

Die doppelte innere Seitenüberschrift entfällt. Drei reduzierte Karten zeigen
links die angerechnete Arbeitszeit dieser Woche, mittig die dieses Monats und
rechts den Gesamtsaldo. Zahlen bleiben neutral; Sollvergleiche und Zusatztexte
unter den Zahlen entfallen. Ein tatsächlich vorläufiger Kontostand bleibt über
einen zugänglichen Hinweis an der Kartenüberschrift erkennbar. Aktuelle Wochen-
und Monatswerte werden auch bei historischer Monatsauswahl geladen.

Die Stempelkarte betont heutigen Status und drei gleich große Aktionen. Einzelne
Stempelereignisse werden dort nicht erneut angezeigt; sie stehen unter den
Wochenbalken und im Buchungsjournal.

Alle Buchungen zeigt höchstens 50 Buchungs-IDs je Seite mit Zurück/Weiter.
Aufgeklappte Versions-/Speicherzeilen zählen nicht als zusätzliche Buchungen.
Die zwei Datumsfelder Von/Bis begrenzen inklusive nach dem Buchungstag; leere
Grenzen sind offen. Suchen setzt auf Seite 1 zurück; Zurücksetzen entfernt die
Grenzen. Ungültige Reihenfolge wird vor dem Abruf abgewiesen.

Die vorhandene Own-Data-Callable bleibt unverändert. Für die obere Datumsgrenze
nutzt der Client den existierenden exklusiven Tagescursor. Er lädt vollständige
Tagesabschnitte mit Historie nur bis genügend passende Buchungen für die Seite
vorliegen beziehungsweise die untere Grenze erreicht ist. Ein Tagesabschnitt
kann auf mehrere sichtbare Seiten verteilt werden, ohne seine Historie zu kürzen.
Zwischenspeicher je Suche vermeidet erneute Abrufe beim Zurückblättern; alte
Suchantworten überschreiben keine neue Suche. Keine neuen direkten Clientrechte.

## Wochennavigation und Pausenanteil (12.11.2026)

Die Wochenkarte besitzt stilgleiche Kalenderpfeile für Vorherige/Nächste Woche
mit Heute dazwischen. Heute führt zur tatsächlichen laufenden Woche zurück,
auch nach mehreren Monatswechseln. Der Zeitraum nennt das Jahr; aktuelle
Übersichtskarten und heutiger Stempelstatus bleiben von der gewählten Woche
unabhängig. Benötigte Wochen außerhalb der geladenen Monatsabschnitte werden
als eigene siebentägige Own-Data-Abfrage geladen, statt einen unbegrenzt großen
Zeitraum anzufordern. Bestehende Korrekturfristen richten sich weiterhin nach
dem tatsächlichen heutigen Datum.

Der Hinweis Sollzeit rechts oben entfällt. Die Sollmarkierung im einzelnen
Tagesbalken und der Sollwert unter dem Balken bleiben erhalten. Ein deutlicher
Rahmen kennzeichnet heute, ohne den ganzen Tag farbig zu füllen. Gebuchte
Pausen erscheinen als eigener gelb/goldener Abschnitt über der angerechneten
Arbeitszeit. Die gemeinsame Skala umfasst Arbeitszeit plus gebuchte Pause;
Pausen werden nicht abgeschnitten oder nochmals als Arbeitszeit gezählt.
Automatische Zusatzabzüge werden nicht als genommene Pause dargestellt.
Farbhinweis und Dauer stehen direkt an der Pausenangabe unter dem Balken.

## Deutlicher Pausenmodus und Handy-Einstieg (12.11.2026)

Der heutige Status in der Stempelkarte ist größer, fett, mit Symbol/Rahmen und
als zugängliche Statusmeldung ausgezeichnet. Während einer Pause erhält die
Karte einen deutlichen Warnfarbenrahmen und eine dezente Warnfarbenfläche.
Ein sichtbarer Rückkehrhinweis und der hervorgehobene Pause-beenden-Button
machen den nötigen Abschluss erkennbar. Nach erfolgreichem pause_end fällt
die Sonderdarstellung wieder weg. Keine automatische Pausenbeendigung,
Animation oder Änderung an den Buchungsfunktionen.

Im Handy-QR-Modal bleibt das X oben rechts der einzige Schließen-Button;
Escape bleibt möglich. Der Link App auf diesem Gerät öffnen steht als letztes
Element unter sämtlichen Installations-/Anmeldetexten. Zieladresse, QR-Code,
Anmeldung und mobile Anwendung bleiben unverändert.

## Dashboard-Zeitkachel (13.11.2026, Dev)

Die Zeitkachel nutzt ihre gesamte Breite für drei große Stempelaktionen und
verteilt den verbleibenden Platz zwischen Tageswerten und unterer Aktionsleiste.
Status mit Symbol/Rahmen und Pause-beenden-Hervorhebung entsprechen dem
Zeitbereich, ohne Kartenrahmen/-hintergrund im Pausenmodus zu verändern.

Drei neutrale Wertefelder zeigen heute angerechnete Arbeitszeit, gebuchte Pause
und Zeitkontosaldo. Der Sollvergleich entfällt; ein tatsächlich vorhandener
zusätzlicher Pausenabzug bleibt gesondert unter der gebuchten Pause erkennbar.
Zeitübersicht/Handy-Einstieg stehen als größere Aktionen in einer abgesetzten
unteren Leiste; Aktualisieren bleibt erreichbar. Bestehende Rechte, Own-Data-
Abrufe, Buchungszustände, Fehlertoleranz und Nachtragserinnerungen unverändert.

## Reihenfolge im Buchungsjournal (13.11.2026, Dev)

Alle Buchungen sortiert nach Buchungsdatum absteigend und innerhalb eines Tages
nach dem tatsächlichen Stempelzeitpunkt absteigend, einschließlich Sekunden.
Die jüngste Buchung steht dadurch vor allen älteren Buchungen. Grundlage ist
der Zeitpunkt der Buchung, nicht das spätere Speichern einer Korrektur.
Die Reihenfolge wird vor der Aufteilung in 50er-Seiten bestimmt. Historische
Unterzeilen behalten ihre Versionsreihenfolge; die Tageslisten unter den
Wochenbalken bleiben weiterhin zeitlich aufsteigend.
