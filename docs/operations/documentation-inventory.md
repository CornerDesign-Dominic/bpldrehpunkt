# Dokumentations-Inventur vor dem Livegang

## Bestand und Bewertung

Geprüft wurden alle projektinternen Markdown-Dateien außerhalb von
Abhängigkeits-, Build-, Vercel-, Emulator- und temporären Verzeichnissen. Unter
`.github/` existiert derzeit keine Markdown-Dokumentation. Die Prüfung fand
gegen die vorhandene Anwendungs-, Functions- und Konfigurationsstruktur statt;
sie enthält keine Secret- oder Konfigurationswerte.

| Pfad | Zweck | Status | Konkrete Begründung | Empfohlene nächste Aktion |
| --- | --- | --- | --- | --- |
| `APP_CHECK_ROLLOUT.md` | Rollout und Prüfung von Firebase App Check | aktuell | Das Callable-Inventar enthält die aktuell 43 Callables mit `enforceAppCheck: true`; Firestore- und Storage-Enforcement sind ausdrücklich weiter deaktiviert. | Bei einer Änderung an Callable-Exports das Inventar gegen den Functions-Code abgleichen; vor einer späteren Enforcement-Entscheidung Metriken und die beschriebenen Ablaufprüfungen durchführen. |
| `FIRESTORE_ACCESS.md` | Zugriffs- und Betriebsmodell für Firestore und Storage | aktuell | Beschreibt den implementierten Produktionsstand für Authentifizierung, aktive Profile, Rollen, die 18 zentralen Fachmodule, Browser-Rules und privilegierte Functions-Zugriffe. Die Angabe von 43 App-Check-geschützten Callables stimmt mit dem Rollout-Dokument überein. | Bei Änderungen an Rules, Rollen, Modulrechten oder privilegierten Functions die Zugriffsbeschreibung und die Pre-Live-Tests gezielt nachziehen. |
| `PROJECT_RULES.md` | Projektgrundsätze und freigegebener erster Release-Umfang | aktuell | Ordnet den ersten Live-Release den 18 vorhandenen Fachmodulen und den zugehörigen Verwaltungsabläufen zu; Produktgrenzen, getrennte Dev-Umgebung und dokumentierte Abnahme wesentlicher Änderungen sind festgehalten. | Nur bei fachlich freigegebenen Umfangs-, Rechte- oder Datenmodelländerungen aktualisieren und diese vor dem Production-Release dokumentiert prüfen. |
| `SECURITY.md` | Sicherheitsleitlinie und Merge-/Deployment-Checkliste | aktuell | Die dokumentierten Qualitätsbefehle existieren; die behandelten Schutzschichten entsprechen der aktuellen Auth-, Rollen-, Rules-, Functions- und App-Check-Struktur. | Vor dem Livegang die Checkliste mit den freigegebenen Rollen und Benutzerabläufen abhaken. |
| `functions/SYSTEM_MAILS.md` | Betriebs-Runbook für die Systemmail-Integration | aktuell | Deckt die belegten serverseitigen Versandpfade für Urlaub, Testmail, Fehlermeldungen und News-Recherche-Fehler sowie Berechtigungen, Lieferdatensätze, kontrollierte Tests und Secrets-Grenzen ab. | Vor Livegang nur mit kontrollierten Empfängern testen; im Betrieb Function-Protokolle, Power-Automate-Ablauf und bei Urlaubsmails die Lieferdatensätze überwachen. |
| `docs/operations/release-baseline.md` | Release-Zuordnung, Artefakt-Policy und Pre-Live-Prüfliste | aktuell | Deckt Branch, Hosting, relevante Konfigurationspfade, Integrationen und die unveränderte App-Check-Entscheidung ab. | Bei einem später freigegebenen Release nur die belegbaren Zuordnungen und Prüfergebnisse fortschreiben. |
| `docs/operations/environments.md` | Zielbild für Production und Entwicklung | aktuell | Hält fest, welche öffentliche Client-Konfiguration derzeit tatsächlich verwendet wird und dass die Projekttrennung noch einen separaten Initialisierungs-Schritt benötigt. | Nach einem freigegebenen Konfigurationsentwurf die tatsächliche Production-/Preview-Zuordnung prüfen. |
| `docs/operations/documentation-inventory.md` | Diese Inventur und Bereinigungsplanung | aktuell | Neu angelegte Bestandsaufnahme mit klaren, noch nicht ausgeführten Folgeschritten. | Nach jeder Dokumentationsbereinigung Status und Begründung aktualisieren. |

Kein Dokument wird derzeit zur Archivierung oder Löschung vorgeschlagen. Eine
spätere Archivierung kommt nur für durch ein nachweislich führendes Dokument
abgelöste historische Entscheidungen in Betracht.

## Festgestellte Dopplungen und Abgrenzungen

- `APP_CHECK_ROLLOUT.md`, `SECURITY.md` und `docs/operations/release-baseline.md`
  behandeln alle App Check beziehungsweise den Releasebetrieb. Die Dokumente
  bleiben sinnvoll getrennt, wenn der Rollout im ersten, die Schutzgrundsätze
  im zweiten und die Abnahme im dritten Dokument führend bleiben.
- `FIRESTORE_ACCESS.md`, `SECURITY.md` und `PROJECT_RULES.md` überschneiden sich
  bei Authentifizierung, Rollen und Zugriffsgrenzen. `FIRESTORE_ACCESS.md`
  führt die technische Zugriffsbeschreibung; `SECURITY.md` die
  Sicherheitsgrundsätze; `PROJECT_RULES.md` die Produkt- und
  Änderungsgrundsätze.
- `docs/operations/release-baseline.md` und
  `docs/operations/environments.md` ergänzen sich: Erstere beschreibt den
  freizugebenden Stand, Letztere die zukünftige Zieltrennung. Sie sollten nicht
  zusammengeführt werden.

## Vorschlag für eine dauerhafte Struktur

| Bereich | Führender Inhalt | Vorgeschlagener Ort |
| --- | --- | --- |
| Operative, aktuelle Dokumentation | Release-Baselines, Umgebungen, Pre-Live- und Betriebschecklisten | `docs/operations/` |
| Sicherheits- und Betriebsdokumentation | Sicherheitsleitlinie, App-Check-Rollout, Firestore-/Storage-Zugriff, Functions-Runbooks | künftig `docs/security/` und `docs/operations/` nach klarer Zuständigkeit |
| Architektur- und Entwicklungsdokumentation | Projektgrundsätze, Modulgrenzen, Daten- und Berechtigungsarchitektur | künftig `docs/architecture/` und `docs/development/` |
| Historische Entscheidungen und Archive | Abgelöste Rollout-Entscheidungen, Migrationen und begründete technische Richtungswechsel | künftig `docs/history/` mit Datum und Ablösungsverweis |

Dieser Vorschlag erstellt keinen neuen Ordner und verschiebt, archiviert oder
ändert keine vorhandene Dokumentation. Erst nach fachlicher Freigabe sollen
einzelne Dokumente in kleinen, getrennten Schritten konsolidiert werden.
