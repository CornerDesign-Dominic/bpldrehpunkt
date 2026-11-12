# To-do-Zusammenarbeit: lokale Prüfung am 12.11.2026

Arbeitsstand ausschließlich lokal auf `dev`. Kein Commit, Push oder Deployment;
`main` und die laufenden Umgebungen wurden nicht verändert.

## Prüfaufbau

Die Browserprüfung verwendet die echten React-Seiten, To-do-Datendienste und
Firestore-Regeln gegen einen lokalen Emulator. Synthetische Identitäten werden
über `mockUserToken` angemeldet. Die Profile, Aufgaben und Termine liegen
ausschließlich in einem eigens erzeugten `demo-todo-browser-*`-Projekt.
Mitarbeiterverzeichnis und Diagnose-/Versandstatus-Aufrufe werden im Browser
isoliert bereitgestellt; der Versanddienst und seine abschließenden Rechteprüfungen
werden separat mit simuliertem Mailprovider getestet. Echte Mails werden nicht
versendet. Diese Prüfung ist keine Abnahme des produktiven Logins/App Check oder
eines veröffentlichten Releases.

Reproduzierbare Vorschau bei laufendem lokalem Firestore-Emulator:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8089'
node scripts/serve-todo-browser-qa.mjs
```

Die Vorschau bindet ausschließlich an `127.0.0.1:4178`; sie ist kein Bestandteil
des Anwendungs-Builds. Ihre Teststeuerung kann nur vorgegebene synthetische
Profile ändern. Die produktiven Firebase-Einstellungen werden nicht verwendet.

## Abgedeckte Abläufe

| Ablauf | Browser | Zusätzliche automatisierte Absicherung |
| --- | --- | --- |
| Anlegen im vollständigen Modal, Pflichtfelder und Personengruppe | Geprüft | SDK-/Rules-Tests für tatsächliche Erstellung und Fallverknüpfungen |
| Gemeinsames Bearbeiten ohne Annahme, Hinweise live bei anderem Nutzer | Geprüft | Live-Listener und aktuelle Berechtigungen |
| Erledigen, Bestätigung abbrechen, erneut bestätigen, wieder öffnen | Geprüft | Parallele Übergänge: genau ein Statuswechsel/Historieneintrag |
| Termine erstellen, ändern, erneut öffnen; Mail an/aus, alle/einzelne Empfänger | Geprüft | Entwurfserhalt, leere Auswahl, Datum/Uhrzeit, Doppelsubmit |
| Termin löschen: abbrechen und bestätigen | Geprüft | Eigener Bestätigungsdialog, Fokus/Escape, Schreibsperre während Aktion |
| Abteilung ↔ Personengruppe, Entfernung und Wiederaufnahme einer Person | Geprüft | Mehrfache Wechsel mit erhaltenen Termin-IDs, Datum, Uhrzeit, Hinweis; keine Kalenderkopien |
| Abteilung verlassen und wieder beitreten, bei geöffnetem Editor | Geprüft | Frische Serverprofile für Lesen, Schreiben, Kalender und Versand |
| Bearbeiten → Lesen → kein Zugriff → Bearbeiten | Geprüft | Deaktivierung, veraltete Rollen-/Namensstände und fehlende Profile |
| Leseberechtigter und fremder Nutzer | Geprüft | Keine Bearbeitungsaktionen bzw. kein Aufgabeninhalt; direkte verbotene SDK-Aufrufe scheitern |
| Gleichzeitige Inhaltsänderung durch einen Kollegen | Geprüft | Kein stilles Überschreiben; ursprünglicher Entwurf bleibt sichtbar |
| Zurückziehen durch Ersteller | Geprüft | Andere Beteiligte verlieren Zugriff; Ersteller behält Nachweis, kein Wiederöffnen |
| Aufgabenwechsel mit offenem Editor/Notizentwurf | — | Entwürfe und Dialoge werden nicht auf eine andere Aufgabe übertragen |
| Mitarbeiterliste vorübergehend nicht verfügbar | — | Reine Inhaltsänderung erhält Empfängerauswahl; Kalenderänderung bleibt gesperrt |
| Neuer Termin gleichzeitig mit Zuordnungswechsel | — | Server-Epoch verhindert unvollständige Empfängerbereinigung; erneuter Versuch berücksichtigt den neuen Termin |
| Entzug nach Versandreservierung, Abschluss/Wiederöffnung/Neuplanung | — | Erneute Rechte-, Empfänger- und Zeitprüfung direkt vor Versand; kein Doppelversand |
| Offen gebliebener Kalender über Mitternacht/Fokus-/Sichtbarkeitswechsel | — | Nächste Termine verwenden das aktuelle Berliner Datum; sichtbare Ansicht wird aktualisiert |

Die erneute Aufnahme nach einem beendeten, verweigerten Firestore-Listener wird
bei Rückkehr/Fokus und alle 30 Sekunden im sichtbaren Fenster erneut autorisiert.
Gültige Detailseiten erhalten Änderungen über Live-Listener. Kalender und
Übersichten prüfen Änderungen ebenfalls bei Rückkehr und regelmäßig sichtbar.

## Zusätzliche Korrekturen aus dieser Prüfung

- Schreibtransaktionen vergleichen aktuelle Inhalte und den ursprünglichen
  Bearbeitungsstand. Der Server liefert das aktuelle eigene Profil für Rechte
  und Autorennamen; alte Formularwerte erteilen keine Berechtigung.
- Ein Termin-Editor behält auch bei Live-Änderungen seine ursprüngliche
  Aufgaben-/Zielgruppenbasis für die Konfliktprüfung.
- Zuordnungswechsel prüfen die Server-Version um das Laden der Termine herum.
  Ein gleichzeitig angelegter Termin kann die Empfängerbereinigung nicht umgehen.
- Eine unveränderte Personen-Zuordnung bleibt nach einer Namensänderung
  bearbeitbar; neue oder geänderte Zielgruppen werden weiterhin strikt geprüft.
- Alte Formulare, neue Routen, gescheiterte Verzeichnisabrufe und Rechteverluste
  überschreiben keine fremden Änderungen oder unbemerkt die Erinnerungsauswahl.
- Doppelklicks und konkurrierende Erledigen-/Wiederöffnen-Vorgänge werden
  abgefangen; Bestätigungen liegen vor den Bearbeitungsdialogen.

## Darstellung

Das Terminmodal trennt Terminart/Datum/Uhrzeit, Kalenderplatzierung,
Mail-Erinnerung/Empfänger und Hinweis. Kopf und Aktionsleiste bleiben sichtbar;
der Inhalt kann bei geringer Höhe scrollen. Die Card gruppiert bevorstehende und
vergangene Einträge und trennt Kalenderzuordnung, Erinnerung und aufklappbaren
Versandstatus. Erledigte Aufgaben zeigen konfigurierte Erinnerungen als pausiert;
Wiederöffnen erhält die Auswahl.

Im Browser geprüft: `614 × 950` und `1280 × 720` CSS-Pixel, kein horizontaler
Überlauf, Aktionsleiste auch bei scrollendem Inhalt erreichbar. Lokale
Bildbelege liegen in `tmp/todo-qa-evidence/`.

## Ergebnisse

- 1.637 Unit-Tests bestanden.
- 95 Emulator-/Integrationstests bestanden, einschließlich vorhandener
  Fallverknüpfungen, Provider- und Erinnerungsregressionen.
- 37 UI-Interaktionstests bestanden: 19 Detailseiten-/Zusammenarbeits-,
  16 Terminmodal-/Card- und 2 Kalenderprüfungen.
- ESLint, Anwendungs-Build, Shared-Modul-Abgleich und `git diff --check` bestanden.

UI-Prüfungen:

```powershell
node scripts/test-todo-collaboration-ui.mjs
node scripts/test-todo-deadlines-ui.mjs
node scripts/test-calendar-collaboration-ui.mjs
```

Integrationstests benötigen `FIRESTORE_EMULATOR_HOST`; Service-Tests mit
Modul-Mocks benötigen zusätzlich `node --experimental-test-module-mocks --test`.
Die vollständige lokale Testausgabe liegt unter `tmp/todo-deep-*.log`.

## Weitere Text- und Layoutbereinigung

Das Anlegemodal und der Terminierungseditor verwenden dieselben kompakten
Felder: Wichtigkeit/Fälligkeit sowie eine eigene Zeile für die optionale
Mail-Erinnerung. Die ausführlichen Informationen stehen hinter einem
tastaturbedienbaren Fragezeichen; allgemeine Selbst-/Alle-Zuweisungshinweise
entfallen. Validierungsfehler, verpasste Erinnerungen und leere Empfängerauswahlen
bleiben sichtbar.

Modals, Detailseite, Listen und Kalender verwenden konsistent „Beteiligte“,
„Mail-Erinnerung“ und „To-do“. Die Detailseite ersetzt keine Texte mehr durch
sichtbare CSS-Pseudotexte; Updates tragen ihre richtige sichtbare und zugängliche
Beschriftung. Neu erzeugte Historieneinträge nennen Termin/Frist mit korrektem
Artikel und Datum. Historische Datensätze werden dabei nicht umgeschrieben.

Erneut geprüft: 39 UI-Tests, 12 gezielte Unit-Tests, 28 Service-/Berechtigungstests
(davon 20 nach abschließender Historientextkorrektur), ESLint und Build.
Die Browserprüfung umfasst Anlegen, Auswahl „Alle“, den Terminierungseditor,
Detail-/Listentexte und die Hilfe im Fristenmodal einschließlich Escape und
vollständig sichtbarer Hilfebox. Lokale Belege: `tmp/todo-wording-evidence/`.
Weiterhin ausschließlich lokal auf `dev`, ohne Push oder Deployment.
