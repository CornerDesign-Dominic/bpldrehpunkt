# Dokumentations- und Umgebungsprüfung

Stand: **28.10.2026**. Ausgangsstand: `dev` bei `bdaf666`, `main` bei
`230c2ad`; beide Dateibäume waren vor dieser Arbeit identisch. Dieses Dokument
trennt die ursprünglichen Befunde vom Ergebnis der anschließenden Bereinigung.

## Umfang

Die rekursive Suche mit `rg --files --hidden --no-ignore` und dem Filter
`*.[mM][dD]` erfasste auch ignorierte und versteckte Verzeichnisse. Beim
ursprünglichen Audit wurden 1.340 Markdown-Dateien gefunden:

- 14 versionierte Projektdokumente, alle gelesen und gegen relevanten Code geprüft.
- Eine ignorierte Kopie von `functions/SYSTEM_MAILS.md` unter
  `tmp/ratings-package-check-8040914359464f9d8eab142f43ecab45/`;
  damals bis auf Zeilenenden inhaltsgleich, keine führende Dokumentation.
- 1.325 Dateien installierter Drittanbieterpakete einschließlich unvollständiger
  Installation und temporärer Paketkopie. Inventarisiert, nicht als eigene
  Drehpunkt-Dokumentation inhaltlich geprüft oder verändert.

Keine zusätzliche projektinterne Markdown-Anweisung in versteckten Ordnern
gefunden. Im Zuge der Bereinigung wurde `releases.md` ergänzt; damit gibt es
nun 15 Projektdokumente. `AGENTS.md` und `README.md` bleiben ausdrücklich für
die anschließende Besprechung offen.

## Führende Dokumente und Bereinigungsstand

| Dokument | Ergebnis |
| --- | --- |
| `PROJECT_RULES.md` | Dauerhafte Grundsätze und aktuellen Produktumfang vom historischen Erstlivegang getrennt; Aufträge, Importe, Zusammenführung, Tracking und Notizen ergänzt. Kein automatischer Abnahmenachweis. |
| `SECURITY.md` | Direkte Profil-Listen von reduzierten Callable-Verzeichnissen unterschieden; Schnittstellenverträge, Wiederholung, Betriebsfehler und sichtbare Speicherfehler ergänzt. Kein vollständiges Sicherheitsaudit behauptet. |
| `APP_CHECK_ROLLOUT.md` | Veraltete Callable-Zahl entfernt; Quellcode-/Deployinventar hier zentral geführt. HTTP-Ingest und Console-Enforcement von Callable-App-Check getrennt. |
| `FIRESTORE_ACCESS.md` | Aktuelle Modulregistrierung, Notizen, persönliche Listenansichten, Import-/Mergepfade, Tracking, Routen, Bewertungen und technische Fallverknüpfungen ergänzt. |
| `functions/SYSTEM_MAILS.md` | Tracking-Versand, Fristerinnerungen, separate Webhooks, globale Pause und bewusste interne Dev-Versandausnahme ergänzt. OpenAI nicht mehr pauschal als gesperrt beschrieben. |
| `docs/operations/environments.md` | Führende Matrix für tatsächliche Codegrenzen je Integration. Statusmail-KI, TomTom und manuellen Dev-Versand ausdrücklich getrennt behandelt. |
| `docs/operations/release-baseline.md` | Als historischer Beleg gekennzeichnet. Alte Ausführungsstände und offene Abnahmen erhalten; heutige umgebungsbasierte Initialisierung präzisiert. |
| `docs/operations/releases.md` | Neues kurzes Runbook für Entwicklung, Prüfung, abgestimmte Firebase-/Frontend-Bereitstellung und Rückkehr zum vorherigen Stand. Keine neue Deploymentautomation eingerichtet. |
| `docs/operations/documentation-inventory.md` | Vollständiges Audit und tatsächliche Umsetzungsergebnisse statt der früheren pauschalen Aktualitätsbewertung. |
| `docs/operations/status-mail-ingest.md` | Datenvertrag von historischer Dev-Flow-Prüfung getrennt. Production-Export bestätigt keinen aktiven Mailflow. Nichtzuordnung, Kosten und fehlende Aufbewahrungsentscheidung benannt. |
| `docs/operations/bilingual-dashboard-release-review.md` | Historischen Prüfbeleg erhalten, Testzahlen nicht als aktuelle Prüfung ausgegeben. |
| `docs/planning/bilingual-ui.md` | Umsetzung auf beiden Hauptbranches bestätigt; Übersetzungslücken und historische Prüfung klar gekennzeichnet. |
| `docs/planning/dycos-csv-import-uebergangsloesung.md` | Implementierte Datenverträge von verbleibender SQL-/Mehrstopp-/Verknüpfungsplanung getrennt. Technische TA-Verknüpfung für Gericht/Streit korrigiert. |
| `docs/release-notes.md` | Änderungen nach 2.0.0 und aktuelle Dev-Arbeit ohne erfundene neue Releaseversion gesammelt. |
| `functions/transportOrderRoutes.dev-smoke-test.md` | Bestehenden manuellen Anbietercheck erhalten; Abnahme von Importwarteschlange, Wiederholung, Parallelität und Verbrauch ergänzt. |

Nicht erledigte fachliche Aufgaben werden nicht allein durch eine geänderte
Dokumentation als umgesetzt erklärt. Historische Abnahmebelege bleiben erhalten.
Die temporäre Kopie und Drittanbieterdokumente wurden nicht bereinigt oder gelöscht.

## Geprüfte Umgebung und Worktrees

- Checkout: `C:/Users/domin/Desktop/Drehpunkt`, Branch `dev`.
  Das frühere Geschwisterverzeichnis `C:/Users/domin/Desktop/BPL-Drehpunkt`
  existiert dort nicht. Remote bleibt `CornerDesign-Dominic/bpldrehpunkt`.
- `.env.local` enthält alle sieben vorgesehenen Variablen und das Projektziel
  `db-bpl-drehpunkt-dev`. Keine `VITE_`-Overrides in der Prozessumgebung.
  Die übrigen Werte wurden nicht ausgegeben; ihre Anbieterregistrierung ist
  dadurch nicht bestätigt.
- Lokale Umgebungsdatei, Vercel-Metadaten und temporäre Projektkopie sind
  korrekt ignoriert. Keine `.firebaserc`; Deploybefehle explizit mit `--project`.
- `.vercel/project.json` verknüpft den Checkout mit `bpldrehpunkt`.
  GitHub meldete Vercel-`success` für die beiden Ausgangscommits.
- `agb-history-main/Drehpunkt`: sauber und losgelöst bei `24c73c9`;
  Commit bereits in `main`.
- `bilingual-dashboard-main/Drehpunkt`: sauberer `main`-Checkout bei `230c2ad`;
  dieser Worktree belegt bereits den Branch `main`.
- `status-mail-context/Drehpunkt`: sauber bei `1fb2836`, vollständig in
  `dev` enthalten und 63 Commits dahinter. Nichts zusätzlich zu übernehmen.

Keine Worktrees entfernt. Andere Chats können sie weiterhin benötigen.

## Filterlücke: Befund und Korrektur

Beim ursprünglichen Live-Abgleich waren beide Firebase-Projekte aktiv und
enthielten jeweils 125 aktive Functions, davon 97 Callables. Der Quellcode
definierte 98 Callables mit App Check. In beiden Live-Inventaren fehlte
`updateOwnTransportOrderListPreferences`.

Der bestehende Client rief diesen Export auf, fing Speicherfehler aber ohne
Rückmeldung ab. Damit konnte der Laufzeitcache eine fehlende dauerhafte
Speicherung verdecken.

Die Korrektur umfasst:

- Die bereits auf `main` vorhandene serverseitige Implementation unverändert
  gezielt bereitstellen; keine Profil-/Rollenrechte oder Rules öffnen.
- Auf `dev` eine sichtbare deutsch-/englischsprachige Fehlermeldung mit
  erneutem Speichern ergänzen.
- Schreibvorgänge pro Benutzer geordnet abarbeiten und schnelle Zwischenstände
  zusammenfassen. Fehlgeschlagene Einstellungen bleiben für Wiederholung erhalten.
  Unveränderte Einstellungen werden nicht erneut geschrieben.
- Die Speicherung nach einem Wechsel der angemeldeten Sitzung nicht unter
  einem anderen Benutzer fortsetzen.

**Dev-Bereitstellung bestätigt:** Der gezielte Deploy war erfolgreich;
`updateOwnTransportOrderListPreferences` ist `ACTIVE` in `europe-west3` mit
Node.js 22. Das Dev-Inventar enthält danach 98 Callables.
Ein Aufruf ohne Anmeldung/App-Check wurde mit HTTP 401 abgewiesen.

**Produktions-Bereitstellung bestätigt:** Dieselbe, gegenüber `main` unveränderte
Implementation wurde anschließend gezielt nach `db-bpl-drehpunkt` bereitgestellt.
Auch dort ist sie `ACTIVE`, das Inventar enthält 98 Callables und ein Aufruf
ohne Anmeldung/App-Check wird mit HTTP 401 abgewiesen.
Der neue Frontend-Fehlerhinweis ist damit nicht automatisch auf `main`.

## Prüfbelege und offene Grenzen

- Lint, Build und Shared-Abgleich erfolgreich. Die bekannte Warnung zum großen
  Frontend-Bundle bleibt bestehen; kein Performance-Umbau Teil dieser Änderung.
- Explizite Testauswahl aus `src`, `shared` und `functions`, ohne doppelte
  `functions/shared`-Kopien: 515 Tests, 490 bestanden, 25 ohne Emulator
  übersprungen, kein Fehler.
- Drei neue Integrationstests zusätzlich tatsächlich gegen den lokalen
  Firestore-Emulator mit Demo-Projekt ausgeführt: eigene Speicherung und
  unveränderte Rollen/Fremdprofile, verweigerter Zugriff ohne aktives Profil,
  Abweisung ungültiger bzw. fremder Profiländerungen. Alle bestanden.
- Fünf neue Speichertests prüfen Fehler/Wiederholung, Reihenfolge bei langsamen
  Antworten, Zusammenfassung neuerer Eingaben, veraltete Fehler und Rücksetzen
  während eines laufenden Schreibvorgangs.
- Kein angemeldeter echter Browsernutzer wurde verwendet. Speichern und
  Wiederladen im echten Dev-Browser bleibt als fachlicher Check offen.
- Aktuelle Vercel-Umgebungswerte, Console-Enforcement, Power-Automate-Flows und
  bestehende Geschäftsdaten wurden nicht verändert oder vollständig live geprüft.
  Vorhandene Function-Namen bestätigen keine identischen Implementierungen.

## Verbleibende Vorbereitung

Als Nächstes gemeinsam den schlanken Inhalt von `AGENTS.md` und `README.md`
besprechen. Ein eigener GitHub-Qualitätsworkflow ist weiterhin nicht eingerichtet;
vorhanden ist der Secret-Scan. Branchschutz wurde nicht geprüft. Aufbewahrung
und Betriebszuständigkeiten für neue Schnittstellen sowie bekannte UI-
Übersetzungslücken bleiben fachliche Restpunkte.
