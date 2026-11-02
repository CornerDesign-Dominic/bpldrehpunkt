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
| Functions, Projekt `db-bpl-drehpunkt-dev`, `europe-west3` | `previewPartnerMergeReversal`, `separatePartnerMerge`, `listPalletAccountSummaries`, `reportClientDiagnostic`, `listDiagnosticsPage` |
| Firestore-Rules | Gezielte Partner-/Fall-/To-do-Ergänzungen unter Erhalt aktueller Reminder- und Inkasso-Guards |
| Frontend | Gebündelter Push ausschließlich nach `dev`, Vercel Preview und Dev-Domain prüfen |
| Shared | Fachliche Quelle und Functions-Kopie der Fall-/TA-Verknüpfungen synchron |
| Indizes, Storage, Secrets, Datenmigration | Keine Änderung für diesen Umfang erforderlich |

Vorheriger Dev-Frontendstand: `f83545fa0df031ddb569525761137c975b516a7e`,
Vercel `dpl_E22PwekUHZKjkbzr4qC6ed5Kxbq9` (Dev-Alias, Preview).
Vorheriges Dev-Ruleset: `5f4e51d4-dda1-49fd-af10-f1c44bb01a29`.
Produktions-`main`: `230c2ad86af9700118e2f1456746292241461efc`.
Vorher-/Nachher-Metadaten werden lokal ignoriert unter `tmp/` abgelegt;
Zugangsdaten gehören nicht in diesen Beleg.

## Prüfung und Durchführung

Vor Veröffentlichung: gezielte Frontend-/Shared- und Backendtests, echte lokale
Firestore-Emulatortests, Lint, Build und Shared-Abgleich auf der zusammengeführten
aktuellen Dev-Basis. Build besitzt die bekannte Warnung zu großen Bundles.

Live-Prüfung verwendet das vorhandene angemeldete Dev-Testkonto und klar
gekennzeichnete, getrennte Testdaten. Keine echten Mails oder DyCoS-/KI-Abrufe
werden zur Prüfung ausgelöst. Datenanlage dient nur der Testvorbereitung;
Benutzerabläufe werden anschließend über die tatsächliche Dev-Oberfläche geprüft.

Durchführungsstatus und genaue Ergebnisse werden nach den Schritten ergänzt.
Ein erfolgreicher Vercel-Build allein ist kein Nachweis eines vollständigen
Backend-Releases. Eine Rückkehr muss Frontend und Rules/Functions abgestimmt
betrachten; es gibt keine Datenmigration zurückzusetzen.
