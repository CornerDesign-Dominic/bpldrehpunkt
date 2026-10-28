# Entwicklung, Prüfung und Veröffentlichung

Stand: 28.10.2026. Dieses Runbook beschreibt den laufenden Releaseweg.
Historische Freigaben bleiben in `release-baseline.md` und `../release-notes.md`.
Umgebungsgrenzen und externe Wirkungen stehen in `environments.md`.

## Entwicklungsstand

Die laufende Entwicklung erfolgt auf `dev` gegen `db-bpl-drehpunkt-dev`.
Änderungen als kleine fachlich abgeschlossene Einheiten bearbeiten. Bei
paralleler oder längerer Arbeit kurze Featurebranches verwenden, damit ein
fertiger Umfang unabhängig von unfertiger Arbeit freigegeben werden kann.

Vorhandene Regeln und Datenmodelle prüfen; Änderungen an Berechtigungen, Rules,
Storage, Importschlüsseln oder privilegierten Functions ausdrücklich bewerten.
Ein neuer Ordnername ändert keine Git- oder Cloud-Zuordnung.

## Prüfung und Abnahme

- `npm run lint`, `npm run build` und `npm run check:functions-shared` ausführen.
- Passende vorhandene und neue Tests explizit aus `src/`, `shared/` und
  `functions/` auswählen. Keine unbeschränkte Suche über `node_modules` und
  `tmp`; dort liegen fremde Tests und alte Paketkopien. `functions/shared`
  enthält die deploybare Kopie von `shared`, keine zweite fachliche Quelle.
- Bei Daten-/Rechteänderungen relevante Emulator-/Integrationstests mit
  explizitem Demo-Projekt ausführen. Übersprungene Tests sind keine bestandenen
  Integrationsprüfungen. Emulator-Prozess und Umgebungsvariablen nach dem Test
  beenden; keine Testdaten in Produktion anlegen.
- Benötigte Backendteile gezielt in Dev bereitstellen und den betroffenen
  Benutzerablauf prüfen: Eingabe, Speicherung, Neuladen sowie Fehler-/Rechtefall.
  Fehlt ein angemeldeter Testnutzer, den offenen Browsercheck ausdrücklich
  nennen; keine Konten oder Anmeldetokens zur Umgehung erzeugen.

Prüfergebnis, Commit bzw. lokalen Änderungsstand und verbleibende Einschränkungen
festhalten. Historische Prüfzahlen nicht als neue Prüfung wiederverwenden.

## Freigegebenen Umfang nach Main übernehmen

Ein Pull Request macht die konkrete Übernahme prüfbar. Ist ganz `dev` freigegeben,
`dev` nach `main` übernehmen. Andernfalls einen Releasebranch ab `main` mit den
freigegebenen Änderungen einschließlich ihrer Abhängigkeiten vorbereiten.
Der Release benennt Problem, Verhalten, Prüfungen und benötigte Deployments.

Für jeden Release gemeinsam betrachten:

| Bestandteil | Nachweis |
| --- | --- |
| Frontend | Freigegebener Git-Stand und erfolgreicher Vercel-Deploy |
| Functions | Benötigte Exporte im vorgesehenen Firebase-Projekt vorhanden und funktional geprüft |
| Firestore-/Storage-Rules | Berechtigungen geprüft und gezielt bereitgestellt, falls geändert |
| Indizes | Benötigte Indizes vollständig aufgebaut, bevor abhängige Abfragen laufen |
| Secrets | Nur benötigte Namen/aktive Versionen prüfen, keine Werte ausgeben oder aus Dev kopieren |
| Datenmigration | Eigener freigegebener Ablauf mit Erhaltungs- und Rückkehrplan, falls erforderlich |

Bei abwärtskompatiblen Erweiterungen zuerst notwendige Indizes aufbauen lassen
und Backend/Rules abgestimmt bereitstellen, dann den neuen Client veröffentlichen.
Neue Rules können alte Clients beeinflussen. Nicht kompatible Änderungen
benötigen einen eigenen Übergangsplan; es gibt keine pauschal sichere Reihenfolge.

Firebase-Befehle immer mit explizitem `--project` ausführen und auf den benötigten
Umfang begrenzen, beispielsweise:

```powershell
firebase deploy --only functions:updateOwnTransportOrderListPreferences --project db-bpl-drehpunkt-dev
```

Rules und Indizes haben eigene Deployziele: `firestore:rules`,
`firestore:indexes` und `storage`. Ein Push nach `main` kann Vercel Production
auslösen, stellt aber keine Firebase-Function bereit. Ein erfolgreicher Build
belegt keine vollständige Veröffentlichung.

## Abschluss und Rückkehr

Nach dem Release den betroffenen Benutzerablauf, Fehlerzustände und benötigte
Backendexporte prüfen. Keine echten Mails allein zur technischen Kontrolle
auslösen. Den veröffentlichten Stand und den vorherigen funktionsfähigen Stand
festhalten; ein Frontend-Rollback setzt weder Rules noch Datenmigrationen zurück.
Releasekorrekturen wieder nach `dev` übernehmen.

Dieses Runbook richtet keine automatische Veröffentlichung ein. Im Repository
existiert bislang nur der GitHub-Secret-Scan; ein eigener Build-/Lint-/Testworkflow
und der tatsächliche Branchschutz sind gesondert zu behandeln.
