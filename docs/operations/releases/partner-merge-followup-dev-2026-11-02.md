# Partnermerge und Folge-To-dos: Dev-Release 02.11.2026

Der Nutzer hat die schrittweise Dev-Veröffentlichung einschließlich benötigter
Bestandteile und anschließender Ablaufprüfung ausdrücklich freigegeben.
Produktion und `main` sind ausgeschlossen. Punkte 1 (DyCoS-TA-Wiederabruf mit
möglichem Ersetzen einer ursprünglichen Partner-ID) und 2 (Identität und
Doppelzählung von Auftragsbewertungen) bleiben offen.

## Umfang und Basis

Isolierter Release-Worktree `partner-followup-dev-release/Drehpunkt`, Branch
`codex/partner-followup-dev-release`, auf aktuellem `origin/dev` aufgebaut.
Der ältere lokale Entwicklungsstand `cf87cb8` wurde nicht vollständig übernommen.
Die neueren Dev-Funktionen für Erinnerungen mit Uhrzeit/Occurrence,
Zuständigkeiten, serverseitige Inkassoanlage, DyCoS-Partnerabgleich und Historie,
Auftragsarbeitsplatz und Bereichsnavigation bleiben erhalten.

Enthalten:

- Ursprungstreue Stammdaten-/Archivnavigation nach Merge und Trennung,
  gemeinsame Namensdarstellung und Suche in Kunden/CRM, Fällen, To-dos und
  Paletten; Originalreferenzen und gespeicherte Snapshots bleiben erhalten.
- Leserechtsgeprüfte Fachrückverweise, Gericht-Gegenseiten mit Rollen- und
  TA-Herkunftsnachweis, Mehrfach-TA-Verknüpfung von Insolvenzen.
- Sichere Trennung früherer Zwischenpartner: geerbte SQL-Identitäten verbleiben
  bei ihren belegten Mitgliedern; Vorschau und Speicherung prüfen die betroffenen
  Dokumentversionen atomar. Portiert auf das heutige
  `dycosReferences.accounts`-/`dycosImport.sourceReferences`-Modell.
- Folge-To-dos überschreiben bearbeitete Vorschläge nicht erneut mit Fallwerten.
  Historische Namensübernahme ist serverseitig belegt; bestätigte Speicherung
  und gescheitertes Listenladen sind getrennt. Speicher-/Dialog-/Suchsperren,
  Entwurfserhalt und Kontextwechsel werden berücksichtigt.

Unabhängige ältere lokale Kalender-/Fristmodal-Erweiterungen sind nicht Teil
dieses abgegrenzten Releases. Die vorhandene Dev-Kalendernavigation und die
neuen Erinnerungsfelder werden erhalten. Es gibt keine neue globale
Echtzeitabfrage. Rechtevertrag: [FIRESTORE_ACCESS.md](../../../FIRESTORE_ACCESS.md).

## Benötigte Bestandteile und Reihenfolge

| Bestandteil | Umfang |
| --- | --- |
| Functions, Projekt `db-bpl-drehpunkt-dev`, `europe-west3` | `previewPartnerMergeReversal`, `separatePartnerMerge`, `listPalletAccountSummaries`, `reportClientDiagnostic`, `listDiagnosticsPage`, `recordCaseTransportOrderLinkCreated`, `recordCaseTransportOrderLinkDeleted` |
| Firestore-Rules | Gezielte Partner-/Fall-/To-do-Ergänzungen unter Erhalt aktueller Reminder- und Inkasso-Guards |
| Frontend | Gebündelter Push ausschließlich nach `dev`, Vercel Preview und Dev-Domain prüfen |
| Shared | Fachliche Quelle und Functions-Kopie der Fall-/TA-Verknüpfungen synchron |
| Indizes, Storage, Secrets, Datenmigration | Keine Änderung für diesen Umfang erforderlich |

Vorheriger Dev-Frontendstand: `f83545fa0df031ddb569525761137c975b516a7e`,
Vercel `dpl_E22PwekUHZKjkbzr4qC6ed5Kxbq9` (Dev-Alias, Preview).
Vorheriges Dev-Ruleset: `5f4e51d4-dda1-49fd-af10-f1c44bb01a29`.
Produktions-`main`: `230c2ad86af9700118e2f1456746292241461efc`.
Die weitere Dev-Importhistorie bis `34c01fa` wurde vor dem Release konfliktfrei
integriert; beide Übersetzungsgruppen und deren neue Serverexports bleiben
erhalten. Die beiden Fall-/TA-Historientrigger werden wegen der aktualisierten
Shared-Typdefinition für Insolvenzen ebenfalls erneuert.
Vorher-/Nachher-Metadaten werden lokal ignoriert unter `tmp/` abgelegt;
Zugangsdaten gehören nicht in diesen Beleg.

## Prüfung und Durchführung

Vor Veröffentlichung bestanden:

- 118 Tests der geänderten Logik-/Vertragsdateien in einem gemeinsamen Lauf;
  zusätzlich gezielte bestehende Navigationstests im Portierungsreview.
- 43 gezielte Rules-/Integrationstests und elf Tests über tatsächliche
  Client-Speicherdienste (To-dos und Stammdaten), keine Skips. Sie umfassen
  erlaubte/verweigerte Zugriffe, historische Namen und Rollenformate,
  aktuelle Reminder-Rules, Merge/Trennung und das heutige DyCoS-Kontenmodell.
  Der zusätzliche Herkunftsnachweis-Race wurde im Account-Trennungstest geprüft.
- Lint, Build, Shared-Abgleich (45 Module) und Diffprüfung auf der aktuellen
  zusammengeführten Dev-Basis. Build besitzt die bekannte Warnung zu großen Bundles.

Live-Prüfung verwendet das vorhandene angemeldete Dev-Testkonto und klar
gekennzeichnete, getrennte Testdaten. Keine echten Mails oder DyCoS-/KI-Abrufe
werden zur Prüfung ausgelöst. Datenanlage dient nur der Testvorbereitung;
Benutzerabläufe werden anschließend über die tatsächliche Dev-Oberfläche geprüft.

Serverbereitstellung am 02.11.2026 abgeschlossen: alle sieben Functions melden
`ACTIVE`; Firestore-Rules wurden erfolgreich kompiliert und veröffentlicht.
Der live gelesene Rules-Hash stimmt exakt mit der geprüften Release-Datei
überein. Produktions-Rules und Produktions-Functions sind im Metadatenvergleich
unverändert. Frontend-Veröffentlichung und Live-Abnahme folgen auf diesem Stand.

Durchführungsstatus und genaue Live-Ergebnisse werden nach den Schritten ergänzt.
Ein erfolgreicher Vercel-Build allein ist kein Nachweis eines vollständigen
Backend-Releases. Eine Rückkehr muss Frontend und Rules/Functions abgestimmt
betrachten; es gibt keine Datenmigration zurückzusetzen.

Erster Frontendstand `a12f273b38e94c422dd81d239e86beca0bcae122`,
Vercel `dpl_Bd5wpoRoJddnJkZDphWz44uRzHzn`, `READY`, Dev-Alias bestätigt.
In der Live-Abnahme fiel im zwischenzeitlich neu hinzugekommenen
Auftragsarbeitsplatz eine weitere Ursprungsverkürzung auf: Übersicht und
Kunde/UTN sowie Tracking verwendeten die aufgelöste Ziel-ID als Link.
Diese drei Ansichten verwenden nun ebenfalls die gespeicherte Ursprungs-ID.
Tracking übernimmt den Rückkehrkontext; der gemeinsame Arbeitsplatz zeigt
bei vorhandenem Kontext den vorhandenen Zurück-Link. 27 passende bestehende
Navigation-/Partner-/Registertests sowie Lint und Build bestanden. Dieser
gezielte Frontend-Nachzug benötigt keine erneute Server-/Rulesbereitstellung.

Weiterer Live-Befund: Bei Partnern ohne zusätzliche Kontonummern war der
bestehende Nummern-/Merge-Dialog nicht erreichbar. Der Referenzen-Header
erhält deshalb einen dauerhaften Einstieg „Nummern & Zusammenführungen“,
unabhängig von vorhandenen Debitoren-/Kreditornummern. Er ist auch im
Lesemodus erreichbar; die Trennung selbst bleibt über die vorhandenen
Modal-/Serverrechte geschützt. 17 gezielte Rollen-/Auswahl-/Partnerlinktests,
Scoped Lint und Build bestanden. Zwei veraltete Strukturprüfungen wurden auf
die inzwischen zentralisierten Auswahlkomponenten nachgezogen; keine Skips.
