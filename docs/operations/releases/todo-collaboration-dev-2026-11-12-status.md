# Gemeinsame To-dos: Dev-Veröffentlichung am 12.11.2026

Der Nutzer hat Push und Deployment ausschließlich für `dev` ausdrücklich
freigegeben. Quellstand: `e3d9e72f7c7b5f7721c39cb3b8191f83c5924806`.
`main` und das Firebase-Produktionsprojekt bleiben unverändert.

## Umfang

- Beteiligte bearbeiten offene To-dos gemeinsam; Annahme/Übernahme entfällt.
  Teilnehmerkreis und Zurückziehen bleiben beim Ersteller/Superadmin.
- Empfänger werden je Erinnerung bzw. Termin/Frist ausgewählt und vor dem
  Versand mit aktuellen Rechten und Abteilungszugehörigkeiten abgeglichen.
- Kalenderansichten leiten sich aus den Originaldaten ab. Wiederholte Wechsel
  zwischen Abteilung und Personen entfernen alte Kalenderzuordnungen.
- Einheitliche Terminierungsfelder, Hilfe hinter dem Fragezeichen und
  konsistente Begriffe in Modals, Detailseite, Listen und Kalender.
- Firestore-Regeln schützen gemeinsame Bearbeitung, Statuswechsel, parallele
  Änderungen und die gesperrten früheren Kalenderkopien.

## Prüfung des freigegebenen Quellstands

- 1.642 Unit-Tests bestanden, keine übersprungen.
- 95 Emulator-/Integrationstests bestanden, keine übersprungen.
- 39 UI-Tests bestanden (21 Zusammenarbeit, 16 Termine/Fristen, 2 Kalender).
- ESLint, Build, Abgleich der 50 deploybaren Shared-Module und Git-Diff-Prüfung
  bestanden. Zusätzlich drei Tests des Regelkompaktierers bestanden.
- Alle drei im Repository definierten To-do-Kompositindizes in Dev sind `READY`.
- Die bereitgestellten Dateien wurden auf die versehentlich in einer
  CLI-Statusausgabe erschienenen Firebase-Anmeldetokens geprüft; kein Treffer.
  Zugangsdaten wurden nicht versioniert.

## Backend

Ziel: `db-bpl-drehpunkt-dev`, Region `europe-west3`, Node.js 22.

Gezielte Exporte:

```text
listTodoCalendarProjection
listVisibleUserDirectory
listReminderStatuses
prepareReminders
prepareBackgroundWork
maintainCalendarReminderParent
maintainDamageReminderParent
maintainInkassoReminderParent
maintainLegalReminderParent
maintainInsolvencyReminderParent
maintainCalendarEventReminder
maintainTodoReminders
maintainCaseDeadlineReminderWork
scheduledCaseDeadlineReminderDispatch
```

Der erste CLI-Versuch stoppte vor Funktionsänderungen, weil die Discovery des
vollständigen Einstiegs Postfachparameter unbeteiligter Exporte verlangte.
Für den gezielten Release wurde deshalb in einer ignorierten, separaten Kopie
des Quellcommits ein Einstieg mit ausschließlich diesen 14 Exporten erzeugt.
Deklarationen und benötigte Hilfsfunktionen wurden unverändert aus `index.js`
übernommen; importierte Fachmodule blieben unverändert. Die Exportmenge,
Endpoint-Metadaten und Handler wurden gegen den vollständigen Einstieg geprüft,
zusätzlich der begrenzte Einstieg mit ESLint. Nur der temporäre Paket-Einstieg
wurde angepasst; keine dotenv-Datei und keine neuen Konfigurationswerte.

Alle 14 Exporte sind nach dem Deployment `ACTIVE`, mit neuen Revisionen und
Node.js 22. Die bisherigen Anwendungskonfigurationswerte und Secret-Verweise
sind erhalten. Die CLI ergänzt die Plattformvariable `FUNCTION_REGION` mit
`europe-west3` auch bei bisher fehlendem Eintrag. Der unangemeldete Aufruf der
neuen Kalender-Callable wird mit HTTP 401 / `UNAUTHENTICATED` abgewiesen.

Firestore-Regeln sind aktiv als:

```text
projects/db-bpl-drehpunkt-dev/rulesets/dd3ee3a6-4666-4eba-9fb8-c690a1b6f426
SHA-256 der kompaktierten Quelle:
e3058b197b3585a9ab389c333a510464afe6199b55f802015e0419c354852f12
```

Die aktive Quelle wurde zurückgelesen und entspricht nach derselben geprüften
Kompaktierung exakt `firestore.rules` des Quellcommits. Vorherige aktive Fassung:
`9214d454-0d89-49ec-8f21-301304c03077`.

Der Cloud-Regeldienst lieferte intermittierend HTTP 503. Wiederholte Testanfragen
mit identischem Quelltext lieferten sowohl 200 als auch 503; deshalb wurde keine
Regellogik umgeschrieben. Der erneute CLI-Versuch kompilierte die unveränderte
kompakte Quelle, meldete zum Schluss aber 409 beim Fallback-Anlegen des bereits
bestehenden Releases. Maßgeblich ist das anschließende erfolgreiche Rücklesen
der tatsächlich aktiven neuen Fassung. Die zwei Compilerwarnungen waren bereits
in der bisherigen aktiven Fassung vorhanden.

## Frontend und Git

Während des Releases wurde unabhängig `780ff2f` auf Dev gepusht (neutrale
Pausencard der Zeiterfassung). Dieser Stand wurde ohne Überschreiben mit dem
To-do-Commit zusammengeführt. Der veröffentlichte gemeinsame Anwendungsstand
ist `3ffaffd0a44a2869c55c71a280370b081493e4b0`; seine Backend-/Regeldateien
entsprechen weiterhin exakt `e3d9e72`. Nach dem Merge bestanden ESLint, Build
und `node scripts/test-time-ui.mjs` erneut.

GitHub meldet für diesen Commit den Vercel-Status `success`:
[Vercel-Deployment](https://vercel.com/cornerdesign-dominics-projects/bpldrehpunkt/2BBXv7jCksBf6anVg5ApP6DWVwFm).
Dev-Adresse: [dev.drehpunktlogistik.de](https://dev.drehpunktlogistik.de).
Ein unangemeldeter HTTP-Aufruf führt dort über Vercel SSO zum Vercel-Login;
die Schutzfunktion wird für den Release nicht umgangen. Deshalb konnte der
ausgelieferte App-Bundle-Inhalt nicht unangemeldet geprüft werden.

Remote `main` blieb während dieses Releases auf
`444269062eb03cab8c931fe795af9e756912fe84`. Kein Produktionsdeployment ausgeführt.
Die nachfolgenden Dokumentationsänderungen verändern den Anwendungsquellstand
nicht und werden ebenfalls ausschließlich nach Dev gepusht.

## Grenzen der Live-Abnahme

Die ausführlichen Benutzerabläufe sind lokal mit synthetischen Identitäten und
den tatsächlichen Regeln geprüft; siehe
[Prüfprotokoll](../todo-collaboration-qa-2026-11-12.md).
Ein angemeldeter Dev-Testnutzer für die vollständige Live-Abnahme steht in
diesem Releaseablauf nicht zur Verfügung. Es werden keine Konten oder Tokens
zur Umgehung angelegt und keine echten Test-Erinnerungen ausgelöst.
Keine Datenmigration oder Datenlöschung ist erforderlich.
