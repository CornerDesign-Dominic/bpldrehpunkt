# Abgegrenzter Dev-Release der Kostenoptimierungen

Stand: 31.10.2026. **Nach ausdrücklicher Freigabe in Dev veröffentlicht.**
Durchführung und Prüfgrenzen stehen im
[Dev-Releasebeleg](releases/cost-efficiency-dev-2026-10-31-status.md).
Die folgenden Abschnitte halten den vorbereiteten Ablauf und seine Haltepunkte
fest; Aussagen über eine ausstehende Veröffentlichung beziehen sich auf den
damaligen Vorbereitungsstand. Produktion und `main` sind ausgeschlossen.

## Umfang und Herkunft

Releasebranch: `codex/cost-efficiency-dev-release`, isolierter Arbeitsordner
`C:/Users/domin/.codex/worktrees/cost-efficiency-dev-release/Drehpunkt`.
Basis ist der abgerufene Dev-Commit
`5e9586145b2df0c939d10fa455f699653e1f40ba`. Der ursprüngliche Arbeitsordner lag
80 Commits dahinter und enthielt weitere unfertige Änderungen. Er wurde nicht
überschrieben. Die Kostenänderungen wurden gezielt auf den aktuellen Dev-Stand
übertragen; der alte Gesamt-Diff ist kein Releasepaket.

Enthalten sind begrenzte Hintergrundjobs, Statusmail-KI-Reservierung,
gezielte Kalender-/Listen-/Partnerabfragen, Palettensummen mit transaktionalem
Schreibweg, verzögertes Laden der Fachseiten sowie die dazugehörigen
Fehler-, Wiederholungs- und Datumsbereinigungen. Fachverträge:
[Hintergrundjobs](cost-background-jobs.md), [Abfragen](cost-query-efficiency.md),
[Paletten](pallet-summaries.md).

Der aktuelle Dev-Stand für Wissenslücken, Qualität, Postfachaktionen,
Rechnungsprüfung/OCR und DyCoS bleibt erhalten. Die CSV-Abschaltung wird nicht
zurückgenommen. Es gibt keine Umbenennung der Transportauftragsnavigation oder
Übernahme anderer unfreigegebener Änderungen aus dem ursprünglichen Ordner.
Die direkte Functions-Abhängigkeit auf das ganze Frontendprojekt entfällt;
die aktuelle explizite Canvas-Abhängigkeit bleibt erhalten.

Die [maschinenlesbare Bestandteilliste](releases/cost-efficiency-dev-2026-10-31.json)
enthält 34 gezielt bereitzustellende Functions in vier Phasen, Rules und Indizes.
Storage bleibt unverändert. Es gibt keine neuen Secrets. Vorhandene Bindungen
der betroffenen Functions bleiben erforderlich, insbesondere für KI,
Postfachaktionen, DyCoS und bestehende Versandwege. Keine Werte in Logs oder Git
kopieren. Der gemeinsame KI-Nutzungscode betrifft auch bestehende Endpunkte;
deshalb enthält das Manifest eine eigene Phase dafür.

## Vor der späteren Freigabe

1. Kandidatencommit und unveränderte Basis festhalten. Wenn `origin/dev` seitdem
   weiterläuft, zuerst zusammenführen und betroffene Prüfungen wiederholen.
   Kein Überschreiben des Dev-Branches und kein Force-Push.
2. Firebase-Ziel ausschließlich **`db-bpl-drehpunkt-dev`**, Region
   `europe-west3`; Frontendziel `https://dev.drehpunktlogistik.de` prüfen.
   Preview muss die sieben Dev-Clientvariablen aus
   [Umgebungen](environments.md) verwenden. Ein erfolgreicher lokaler Build ohne
   diese Laufzeitkonfiguration ist kein Nachweis der Dev-Anmeldung.
3. Vorherige funktionsfähige Frontendbereitstellung, tatsächliche
   Function-Revisionen, Rules und vorhandene Indizes für den Rückweg festhalten.
   Die read-only Bestandsaufnahme vom 31.10.2026 fand 158 Dev-Functions, die
   beiden Scheduler und den Postfachworker; die neuen Vorbereitung-/Paletten-
   Callables fehlten. Das ist keine Aussage über deren ausgelieferten Quellcode.
4. Angemeldeten aktiven Superadmin, regulären Fachnutzer, Nur-Lese-Nutzer und
   zwei getrennte Browsersitzungen für die Abnahme bereitstellen. Bestehendes
   App Check verwenden, keine Token-/Kontenumgehung einrichten.
5. Paletten-Schreibpause ankündigen. Bestehende Clients schreiben noch direkt;
   die Rules-Umstellung wirkt deshalb auch auf offene Sitzungen.
   Externe Prüfungen gemäß Umgebungs-Matrix planen; keine echten Mails allein
   zum technischen Test versenden.

## Gestufte Bereitstellung nach eigener Veröffentlichungsanweisung

Die folgenden PowerShell-Beispiele gelten im Releaseordner. Einzelne Phasen
bewusst wählen; kein pauschales `firebase deploy` oder `--only functions`.

```powershell
firebase deploy --only firestore:indexes --project db-bpl-drehpunkt-dev
```

Zuerst vorhandene Live-Indizes mit dem Kandidaten vergleichen; keine fremden
Indizes löschen und keine Löschrückfrage pauschal bestätigen. Alle benötigten
Indizes müssen fertig aufgebaut sein: 71 Composites insgesamt, davon 59 neue
(54 Listenfilter, vier Kalender, ein Palettenabschluss) sowie der Collection-
Group-Einzelfeldindex für `deadlines.date`. Zusätzliche Indizes erzeugen
Speicher-/Schreibkosten; ein Emulator prüft keine echten Cloud-Indexzustände.

Für jede Functions-Phase wird genau die Liste aus dem Manifest verwendet:

```powershell
$manifest = Get-Content docs/operations/releases/cost-efficiency-dev-2026-10-31.json -Raw | ConvertFrom-Json
$phaseName = 'worker'
$phase = @($manifest.functionPhases | Where-Object id -EQ $phaseName)
if ($manifest.project -ne 'db-bpl-drehpunkt-dev' -or $phase.Count -ne 1) { throw 'Ungültiges Dev-Ziel oder Phase.' }
$deployTargets = ($phase[0].functions | ForEach-Object { 'functions:' + $_ }) -join ','
firebase deploy --only $deployTargets --project db-bpl-drehpunkt-dev
```

Reihenfolge und verbindliche Haltepunkte:

1. **`worker`**: Nur `rebuildShipmentTrackingWork` bereitstellen. Queue,
   benötigte Cloud-Tasks-/Invoker-Rechte und ausführbare Revision prüfen.
   Bestehende minimale Workerrechte als Vorlage verwenden; keine pauschalen
   Owner-Rechte. Noch keine Konfiguration allein zum Queue-Test verändern.
2. **`preparation`**: Projektionstrigger und neue Callables bereitstellen.
   Der Auftragstrigger pflegt zugleich die Listenprojektion und das
   Relationsverzeichnis; dafür existiert kein weiterer separater Listentrigger.
   Die beiden bisherigen Scheduler bleiben zunächst auf ihren alten Revisionen.
   Auch `separatePartnerMerge` muss bereits hier auf die neue Revision: Der
   bestehende Admin-SDK-Schreibweg umgeht Client-Rules und muss den Summenaufbau
   serverseitig gegen parallele Legacy-Umschreibungen schützen.
3. **Hintergrunddaten vollständig vorbereiten**: `prepareBackgroundWork`
   authentifiziert wiederholt aufrufen, bis alle drei Ergebnisse
   `tracking.complete`, `reminders.complete`, `list.complete` wahr sind.
   Ein Aufruf verarbeitet höchstens je 200 Quellen. Fehler diagnostizieren und
   fortsetzen; die Readiness niemals von Hand setzen.
4. **Palettenwartung**: Vor Beginn des Summenaufbaus neue Rules bereitstellen:

   ```powershell
   firebase deploy --only firestore:rules --project db-bpl-drehpunkt-dev
   ```

   Direkte Writes tatsächlich als verweigert prüfen. Danach
   `rebuildPalletSummaries` wiederholt aufrufen (maximal 100 Quellen je Aufruf),
   bis `complete: true`. Im Zustand `building` sperrt auch die neue Callable
   Buchungen. Bei Unterbrechung fortsetzen, keine Teilgeneration freigeben.
   Der vollständige Zustand verlangt `version: 1`, `status: ready`, eine
   Generation und `tourCoverage: true`. Bis dahin bleiben vollständige
   Legacy-Lesepfade erhalten. Alte Clients müssen aktualisiert werden.
5. **`switch-after-readiness`** erst bei fertigen Hintergrunddaten und Indizes:
   die beiden Scheduler und übrigen betroffenen Endpunkte gemeinsam umstellen.
   **`shared-ai-usage`** zusätzlich bereitstellen, damit auch die bestehenden
   KI-/OCR-/Postfachpfade die abgesicherte Nutzungserfassung enthalten.
   Keine neuen Provider- oder Secretkonfigurationen dabei erfinden.
6. **Frontend zuletzt**: Den abgegrenzten Kandidaten nach ausdrücklicher
   Anweisung kontrolliert in `dev` übernehmen und einmal gebündelt pushen.
   Vercel-Dev-Zuordnung, Build und Anmeldung prüfen. Kein Merge nach `main`.
   Aktive Sitzungen aktualisieren, anschließend die Abnahme unten durchführen.

## Vorbereitungsaufrufe und lesende Kontrolle

Für die später freigegebene Datenvorbereitung kann eine lokale Vite-Sitzung
dieses Kandidaten gegen die bestehende Dev-Web-App-Konfiguration genutzt werden.
Konfiguration gemäß `environments.md`, normale Superadmin-Anmeldung und gültiges
App Check sind Voraussetzungen. Keine Secrets oder fremden Tokens kopieren.
In deren Browserkonsole jeweils **eine** Seite ausführen und Ergebnis prüfen:

```javascript
const releasePreparation = await import('/src/lib/costReleasePreparation.js')
await releasePreparation.prepareBackgroundWorkPage()
// Nach Rules-Umstellung und angekündigter Schreibpause:
await releasePreparation.rebuildPalletSummariesPage()
```

Die Hilfsfunktionen erlauben nur eine lokale Entwicklungssitzung gegen das
explizite Dev-Projekt. Sie sind nicht in die normale Oberfläche eingebunden,
führen keine Schleife aus und übernehmen die serverseitige Rollenprüfung nicht.
Ein Timeout ist keine Rücksetzaufforderung: denselben Aufbau fortsetzen.
Der Helfer hat keinen direkten Schreibzugriff auf die Quellcollections.

Die rein lesende Kontrolle verwendet bestehende autorisierte Application
Default Credentials mit Leserecht auf vier Statusdokumente; Firebase-CLI-Login
allein stellt diese nicht automatisch bereit. Dafür keine neuen Schlüsseldateien
anlegen. Ohne solche Anmeldung die drei Callable-Ergebnisse und den
Palettenstatus mit dem berechtigten Betreiber prüfen; CLI-Fehler sind kein
bestätigter Datenzustand.

```powershell
node functions/costReleaseReadiness.js --project db-bpl-drehpunkt-dev --require background
node functions/costReleaseReadiness.js --project db-bpl-drehpunkt-dev --require all
```

Exit 0: geforderte **Datenzustände** vollständig; Exit 2: unvollständig;
Exit 1: Kontrolle fehlgeschlagen. Keine Quelle, Cursor oder Zugangsdaten werden
ausgegeben. Das Werkzeug liest vier Dokumente und schreibt nichts. Es bestätigt
weder aktive Function-Revisionen noch Indizes, Queue-IAM oder echte Zustellung.
Ein Neuaufbau kann den Status nach der Kontrolle wieder ändern; unmittelbar
vor dem Umschalten erneut kontrollieren und keine Policyänderung übersehen.

Für den ausdrücklich beauftragten Dev-Release darf der bereits IAM-berechtigte
Deployment-Betreiber dieselben begrenzten Aufbaukerne auch lokal mit der
bestehenden Google-CLI-Anmeldung ausführen. Dafür wird kein Anwendungskonto
imitiert und keine Rollenprüfung einer öffentlichen Callable ersetzt.
`advancePalletSummaryRebuild(db)` enthält dieselbe einzelne Transaktion wie die
geschützte Callable; die drei Hintergrundprojektionen verwenden ihre bestehenden
`advance...`-Funktionen. Datenbankziel und API-Pfade müssen ausdrücklich auf
`db-bpl-drehpunkt-dev` begrenzt sein. Bestehende Anmeldung nur im Speicher zur
normalen OAuth-Aktualisierung verwenden; keine Token-/Schlüsseldatei erzeugen
oder Zugangsdaten ausgeben. Dieser administrative Ablauf ist kein neuer
Clientzugriff und wird nicht als öffentlicher Endpoint exportiert.
Reihenfolge, Readiness, Palettenschreibpause und Fehlerdiagnose bleiben gleich.

## Abnahme in Dev und Beobachtung

Noch offen, bis der Release tatsächlich bereitgestellt und angemeldet geprüft ist:

- Tracking: früher manueller Start, manuell laufend/beendet, Terminänderung,
  keine Automatik nach Abschluss; echte Queue-Fortsetzung nach einer geplanten
  Policyänderung mit nachweislichem Aufbauabschluss. Versandfenster und
  vorhandene Versandbelege erhalten, keine zusätzlichen Testmails auslösen.
- KI: eine Auswertung bei gleichzeitiger Anfrage, abgelaufene Reservierung im
  Maildialog wieder aufnehmen, manuellen Review nicht überschreiben.
- Liste/Kalender/CRM: Relation und Datum über mehrere Seiten, Sortierung und
  Verlinkungen, Monatswechsel und schnelle Wechsel während des Ladens,
  zehn nächste Termine, bewusste leere Auswahl, fehlende Modulrechte.
- Paletten: Übersicht gegen historische Detailberechnung abgleichen; Anlegen,
  Ändern, Löschen und Abschluss, zwei konkurrierende Sitzungen, unklarer
  Anfrageausgang ohne Doppelbuchung; Eingaben bei Konflikt erhalten. Nur Lesen,
  unberechtigt, Deutsch/Englisch sowie Light/Dark prüfen.
- Erhaltene Abläufe kurz prüfen: DyCoS-Abruf, Rechnungs-/Postfachaktionen,
  Wissens-/Qualitätsseiten. Bestehende externe Wirkungen nur im vereinbarten
  fachlichen Rahmen auslösen. Lade- und Fehlermeldungen und zentrale Diagnose
  prüfen; ein Frontend-Build ist keine fachliche Abnahme.

Vorher/nachher Read-Anzahlen, Laufzeiten, Aufrufe, Rebuild-Dauer und Fehler über
vergleichbare Nutzung erfassen. Pro geöffnetem Modul und aktivem Auftrag
vergleichen; mehr Nutzer/Aufträge nicht mit einem Rückschritt verwechseln.
Keine feste Euroersparnis aus Screenshots oder Emulatorläufen ableiten.
Teilstringsuche, dynamische Trackingfilter und sehr breite Zeiträume bleiben
potenziell teure Lesepfade. Alte Summengenerationen und Rebuildbelege werden
zunächst erhalten; keine unkonfigurierte automatische Löschung voraussetzen.

## Rückweg

Vor einem Rückweg externe Versandbelege und laufende Vorgänge erhalten.
Die bisherigen Scheduler können gezielt auf die festgehaltenen vorherigen
Revisionen zurückgestellt werden; sie verwenden wieder vollständige Quellen.
Die neuen Projektionen ergänzen Daten und löschen keine Fachhistorie.
Indizes können zunächst bestehen bleiben. Worker/Trigger nur koordiniert
zurückstellen; keine Quell- oder Versanddaten zur Bereinigung löschen.

Bei Paletten bevorzugt im neuen Schreibvertrag korrigieren. Ein reiner
Frontend-Rollback lässt alte Clients an den neuen Rules scheitern. Ein reiner
Rules-Rollback erlaubt direkte Writes neben dem neuen Summenschreibweg und
kann Summen beschädigen. Eine vollständige Rückkehr benötigt deshalb eine
eigene koordinierte Schreibpause: neue Schreib-Callable stilllegen, laufende
Writes abwarten, alten Client/Backendstand gemeinsam herstellen, Summenstatus
invalidieren und erst anschließend alte Rules kontrolliert wieder zulassen.
Im unterbrochenen Aufbau zunächst gesperrt lassen und fortsetzen; `building`
nicht manuell durch `ready` ersetzen. Source-Buchungen bleiben führend.

## Lokale Nachweise

Die endgültigen Prüfergebnisse des Kandidaten stehen im begleitenden
[Prüfbeleg](cost-efficiency-dev-verification.md). Cloud-Indexaufbau, echte
Cloud-Tasks-Zustellung/IAM, angemeldete Browserabnahme und Einsparungsmessung
stehen ausdrücklich aus. Kein Push, Cloud-Deploy oder Dev-Datenaufbau wurde
im Rahmen der Vorbereitung ausgeführt.
