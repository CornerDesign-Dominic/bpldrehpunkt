# To-do-Terminierung erst nach dem Anlegen: Dev, 13.11.2026

Nach ausdrücklichem Auftrag ausschließlich auf `dev` umgesetzt und für Dev
veröffentlicht. Anwendungscommit: `5a373d0f6c3f0fbe7c34cbe95f1f27cd1fb27b10`.

## Verhalten

Das Anlegemodal enthält Inhalt, Wichtigkeit, Beteiligte und Verknüpfungen.
Fälligkeit und Mail-Erinnerung werden anschließend beim gespeicherten To-do über
„Terminierung bearbeiten“ ergänzt; weitere Termine und Fristen über die
entsprechende Card der Detailseite. Wichtigkeit steht kompakt im Inhaltsbereich.
Die gemeinsame Form gilt auch für das Anlegen aus Schäden, Inkasso,
Gericht/Streit und Insolvenzen.

Neue Formulare übernehmen keine unsichtbaren Datums-/Erinnerungsvorgaben aus
Initialwerten oder verknüpften Fällen. Bestehende Terminierungen bleiben erhalten.
Die Daten- und Berechtigungsregeln sowie Cloud-Functions bleiben unverändert;
benötigt wird ausschließlich das neue Frontend.

## Aktuelle Prüfung

- 41 UI-Tests: 23 Zusammenarbeit/Detailseite/Anlegen, 16 Termine/Fristen,
  2 Kalender; alle bestanden, keine übersprungen.
- 56 Emulator-/Integrationstests bestanden, keine übersprungen: Anlegen ohne
  Terminierung, erste nachträgliche Erinnerung, Termin und Frist, Bearbeiten und
  Löschen nach Wiederöffnen, Leserechte, Rechteentzug, Abteilungs-/Personenwechsel,
  Fallverknüpfungen und Versand-Guards.
- 16 gezielte Unit-Tests bestanden; ESLint, Build, Abgleich der 50 Shared-Module
  und Git-Diff-Prüfung bestanden.
- Browser mit synthetischen Identitäten und tatsächlichen Firestore-Regeln:
  kompaktes Modal, Anlegen ohne Datum, nachträgliche Haupt-Erinnerung und Termin
  mit Erinnerung, Erledigen (Versand pausiert), Wiederöffnen (Einstellungen
  erhalten). Echte Mails werden im lokalen Prüfaufbau nicht versendet.
- Lokaler Bildbeleg: `tmp/todo-detail-only-create.png`; Testausgaben:
  `tmp/todo-detail-only-*.log` (ignorierte lokale Artefakte).

## Veröffentlichung

Push ausschließlich nach `origin/dev`. Vercel meldet für den Anwendungscommit
`success`: [Deployment](https://vercel.com/cornerdesign-dominics-projects/bpldrehpunkt/H2kegcGCnFmRfzjqTiU8PRTsoSpM).
Testadresse: [dev.drehpunktlogistik.de](https://dev.drehpunktlogistik.de).
Die angemeldete Live-Abnahme erfolgt dort durch den Nutzer; die ausführlichen
Browserabläufe wurden lokal mit synthetischen Konten geprüft.

Remote `main` bleibt auf `a6e4c182dcf7ef84538b77e1bab8e7efbea53a77`.
Kein Produktionsdeployment. Ein nachfolgender Dokumentationscommit verändert
den Anwendungsstand nicht.
