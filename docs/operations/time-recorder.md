# Zeiterfassung und Mitarbeiter-PWA

Stand: 10.11.2026. Implementierung auf `codex/time-recorder`, in Firebase Dev
bereitgestellt; [Deploy- und Prüfbeleg](releases/time-recorder-dev-2026-11-10.md).
Keine vollständige fachliche Abnahme. Mobile Anwendung im separaten
Repository `CornerDesign-Dominic/BPLTimeRecorderMobile`.

## Gemeinsame Grundlage

Drehpunkt und die PWA verwenden dieselbe Firebase Authentication, dieselbe
Firestore-Datenbank `(default)` und dieselben Cloud Functions. Entwicklung
verwendet `db-bpl-drehpunkt-dev`, Produktion erst nach separater Abnahme
`db-bpl-drehpunkt`. Das zweite Repository benötigt keine zweite Datenbank und
keine zweite Benutzerverwaltung. Die Anmeldung muss pro Browser/Origin erfolgen;
gleiche Zugangsdaten bedeuten keine automatisch geteilte Browsersitzung.

Zeitdaten sind eigene Collections: `timeWorkModels`, `timeAccounts`, `timeDays`,
`timeHistory` und die serverseitige Buchungs-Deduplizierung. Browserzugriffe
werden verweigert; Callables prüfen aktives Profil und fachliche Berechtigung.
Arbeitszeitberechnung ist in `shared/timeTracking.js` zentral definiert;
`functions/shared` ist die durch das vorhandene Sync-Skript erzeugte Deploykopie.

## Rollen

- Mitarbeiter mit `timeTracking: view` sehen eigene Zeitdaten. `edit` erlaubt
  Stempeln sowie eigene Nachträge/Korrekturen für heute und die letzten sieben
  Berliner Kalendertage. Ältere Zeiten ändern zuständige Zeitmanager/Superadmins.
- Nur Superadmins vergeben `timeManager`, `timeManagerAllDepartments` und
  `timeManagerDepartments` im Admincenter. Urlaubsmanager sind unabhängig davon.
  Adminrolle oder Personalrecht allein gewähren keine Zeitmanager-Zuständigkeit.
- Zeitmanager bearbeiten ausschließlich Personen ihrer zugewiesenen Abteilungen;
  das allgemeine Recht für eigene Zeiten ist davon getrennt.
- Arbeitszeitmodelle und deren Verwaltung sind ausschließlich Superadmins
  zugänglich. Mitarbeiter und Zeitmanager erhalten berechnete Tageswerte, keine
  vollständigen Modelle oder deren Änderungshistorie.
- Personal-Auswertungen und die Krankheitserfassung sind ein späterer Umfang.
  Keine Krankmeldefunktion in der PWA.

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
eingetragen. Tagesabweichungen summieren sich über die Tage. Auf freien Tagen
zählt tatsächlich geleistete Arbeit vollständig als Pluszeit.

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

Neue mehrtägige Anträge mit halbem Urlaubstag benötigen `halfDayDate`. Historische
Anträge mit z.B. 2,5 Tagen ohne Tageszuordnung sind fachlich nicht eindeutig und
müssen sichtbar zur Klärung markiert werden. Der bestehende Urlaubsbestand wird
nicht automatisch umgeschrieben.

## Stempelbuchungen und Pausen

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
Bei Korrekturen wird neu berechnet.

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
erfolgt bei wiederhergestellter Verbindung und erneutem Öffnen. Wiederholte
Übertragung erzeugt keine Doppelbuchung. Fehler/Konflikte bleiben sichtbar und
werden nicht als erfolgreich übertragen dargestellt. Noch ausstehende Ereignisse
werden nicht unter einem anderen angemeldeten Benutzer gesendet.

Stempel- und Korrekturanfragen enthalten außerdem `expectedUserId` als erwartete
Akteursidentität. Der Server vergleicht diese mit der authentifizierten UID;
ein Kontowechsel während App Check oder einer Übertragung darf keine Aktion
unter dem neuen Konto auslösen. Ein Konflikt blockiert nur die übrigen Ereignisse
seines Tages. Nach ausdrücklicher Klärung kann ein lokaler Beleg archiviert
werden, wobei der ursprüngliche Beleg auf dem Gerät erhalten bleibt.

Urlaub und Zeitkorrekturen benötigen Internet. Der Service Worker speichert die
Anwendungshülle, keine Firebase-Antworten oder fremden Personaldaten. Lokal
gespeichert und serverseitig bestätigt werden klar unterschieden.

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

## Abnahme vor Veröffentlichung

- Berechnungsfälle: Pausenstufen/Grenzen, gebuchte Pausen, halber/ganzer Urlaub,
  Feiertagsregion, freier Tag, Modellwechsel, Anfangssaldo, fehlender Feierabend.
- Rechtefälle: eigene/fremde Daten, zuständige/fremde Abteilung, Zeit- versus
  Urlaubsmanager, normaler Admin, deaktivierte Profile, Modelle nur Superadmin.
- Buchungsfälle: wiederholte IDs, Web/Handy-Konflikte, veraltete Korrektur,
  Offline-Warteschlange nach Neustart und Benutzerwechsel, 7-Tage-Grenze.
- `npm run lint`, `npm run build`, `npm run check:functions-shared` und die
  zugehörigen Node-/Emulatortests. Übersprungene Emulatorprüfungen explizit nennen.
- PWA-Umgebungswerte, erlaubte Auth-Domain und App-Check-Registrierung für Dev
  hinterlegen. Kein automatischer Fallback auf das Produktionsprojekt.
- Echten Mitarbeiterablauf in Dev mit angemeldetem Testnutzer abnehmen. Keine
  Testdaten, Migration oder Function-Veröffentlichung in Produktion durchführen.
