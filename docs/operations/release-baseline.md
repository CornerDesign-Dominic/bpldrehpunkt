# Release-Baseline – erster Livegang

## Geltungsbereich

Diese Baseline beschreibt ausschließlich die technische Zuordnung des für den
Livegang vorgesehenen Stands. Sie enthält keine Zugangsdaten, Secret-Werte,
Tokens, API-Keys oder vollständigen Firebase-Konfigurationen und führt keine
Bereitstellung aus.

## Produktionszuordnung

| Bereich | Zuordnung |
| --- | --- |
| Produktionszweig | `main` |
| Firebase-Produktionsprojekt | `db-bpl-drehpunkt` |
| Functions-Region | `europe-west3` |
| Vercel-Produktionsdomain | `https://bpldrehpunkt.vercel.app` |
| Web-Anwendung | Vite-Frontend aus dem Repository-Stammverzeichnis |
| Server-Komponente | Firebase Functions aus `functions/` |

Die Firebase-Projektzuordnung ist in der zentralen Client-Initialisierung
`src/lib/firebase.js` hinterlegt. Die Functions-Region wird in den jeweiligen
Functions-Modulen gesetzt; die Client-Anbindung der Functions erfolgt ebenfalls
über `src/lib/firebase.js`.

## Relevante Konfigurations- und Betriebsdateien

| Bereich | Dateien | Technische Zuordnung |
| --- | --- | --- |
| Firebase-Bereitstellung | `firebase.json` | Verweist auf Firestore-Regeln und -Indizes, Storage-Regeln sowie den Functions-Quellordner. |
| Firebase-Client | `src/lib/firebase.js` | Zentrale Initialisierung für Firebase Authentication, Firestore, Storage, Functions und App Check. |
| Firestore-Regeln | `firestore.rules` | Serverseitige Zugriffsregeln für Firestore. |
| Firestore-Indizes | `firestore.indexes.json` | Zusammengesetzte Firestore-Indizes. |
| Storage-Regeln | `storage.rules` | Serverseitige Zugriffsregeln für Firebase Storage. |
| Functions | `functions/index.js`, `functions/*.js`, `functions/package.json` | Functions-Entrypoint, Funktionsmodule und deren Node-Laufzeit/Abhängigkeiten. |
| Vercel | `vercel.json` | SPA-Rewrite auf `index.html`; die Projektverknüpfung liegt nicht im Repository. |
| Frontend-Build | `package.json`, `eslint.config.js` | Vite-Build und ESLint-Prüfung. |
| Umgebungsvariablen | `.env.example`, `.gitignore` | Ausschließlich Variablennamen und Ignore-Policy; lokale Umgebungsdateien bleiben außerhalb von Git. |
| App-Check-Betrieb | `APP_CHECK_ROLLOUT.md`, `SECURITY.md` | Rollout-Reihenfolge, Schutzschichten und Betriebsprüfung. |
| Berechtigungsmodell | `FIRESTORE_ACCESS.md`, `src/auth/`, `src/lib/permissions.js` | Authentifizierung, aktive Profile, Rollen und Modulrechte. |

## Vorhandene lokale Qualitätsbefehle

| Prüfung | Befehl | Quelle |
| --- | --- | --- |
| Lint | `npm run lint` | Skript in `package.json` |
| Production-Build | `npm run build` | Skript in `package.json` |
| Vercel-Buildanalyse | `npm run analyze:vercel` | Skript in `package.json`; nur Analyse, kein Deployment |
| Functions-Tests | `node --test functions/*.test.js` | Node-Testmodule in `functions/*.test.js`; kein separates Functions-Testskript definiert |

## Externe Integrationen

| Integration | Zweck |
| --- | --- |
| Firebase Authentication | Anmeldung der geschlossenen internen Anwendung. |
| Cloud Firestore | Fach- und Metadaten. |
| Firebase Storage | Dokumentdateien und zugehörige Objekte. |
| Firebase Functions | Geschützte Callables sowie Auth-, Firestore- und Storage-Trigger. |
| Cloud Scheduler | Zeitgesteuerte Aktualisierungen und News-Recherche. |
| Firebase App Check / reCAPTCHA Enterprise | Herkunftsnachweis für Web-Clients und Schutz von Client-Endpunkten. |
| OpenAI | Serverseitige KI-gestützte Auswertungen und Entwürfe. |
| Power Automate | Serverseitige Benachrichtigungen und Systemmails über Webhooks. |
| Vercel | Hosting des Vite-Frontends unter der Produktionsdomain. |

## Nicht einzucheckende und nicht über Vercel auszuliefernde Artefakte

Die in `.gitignore` definierte Policy bleibt maßgeblich. Insbesondere gehören
nicht in Git und nicht in Git-basierte Vercel-Deployments:

- lokale Umgebungsdateien, Credentials, Schlüssel, Service-Account-Dateien,
  Debug-Tokens und Logs;
- Firebase-Emulator- und lokale Vercel-Artefakte;
- Build-, Coverage-, Testresultat-, temporäre KI- und Analyse-Artefakte;
- Uploads, Downloads, generierte Dokumente, PDFs, Bilder, Backups und
  Testdaten.

Produktive Secrets und Webhook-Ziele bleiben ausschließlich in den dafür
vorgesehenen Secret- bzw. Umgebungsvariablen-Verwaltungen. Sie werden weder in
diesem Dokument noch in Client-Variablen oder Repository-Dateien abgelegt.

## Pre-Live-Prüfliste

- [ ] `main` enthält ausschließlich den freigegebenen Release-Stand; der
      Arbeitsbaum ist vor dem Release nachvollziehbar und frei von
      unbeabsichtigten Änderungen.
- [ ] Lint, Production-Build und alle Functions-Tests sind lokal erfolgreich.
- [ ] `firestore.rules`, `storage.rules` und `firestore.indexes.json` wurden
      gegen den freigegebenen Stand geprüft.
- [ ] Functions in `functions/` wurden einschließlich Regionszuordnung,
      Triggern, Schedulern und erforderlichen Secret-Namen geprüft.
- [ ] Firebase Authentication, aktive Benutzerprofile sowie Login und Logout
      wurden mit den vorgesehenen Konten geprüft.
- [ ] Storage-Upload, -Download, Dokumentzugriff und persönliche Signaturen
      wurden mit den vorgesehenen Rollen geprüft.
- [ ] App Check ist für Web-Client und Callable-Endpunkte gemäß
      `APP_CHECK_ROLLOUT.md` geprüft.
- [ ] Rollen, Modulrechte und administrative Abläufe wurden mit mindestens
      Standardbenutzer-, Fachrollen- und Administratorprofilen geprüft.
- [ ] Kritische Benutzerabläufe wurden Ende-zu-Ende geprüft: Anmeldung,
      Stammdaten/CRM, Paletten, Dokumente, To-dos sowie die für den Livegang
      freigegebenen Fachbereiche.
- [ ] Produktionsdomain, Vercel-Umgebungsvariablennamen und Firebase-Projekt
      sind dem freigegebenen Ziel zugeordnet, ohne Werte in Git zu übernehmen.

**Unveränderter App-Check-Entscheid:** Das App-Check-Enforcement für Firestore
und Storage bleibt in diesem Schritt unverändert und wird nicht aktiviert.
Eine spätere Aktivierung erfolgt ausschließlich nach der in
`APP_CHECK_ROLLOUT.md` beschriebenen Metrik- und Ablaufprüfung.

## Release 2.0.0 – geplanter Produktionsablauf

Dieser Ablauf ist erst nach einer ausdrücklichen Freigabe auszuführen. Die
Produktionsdatenbank wird für Release 2.0.0 nicht migriert oder gesichert, weil
sie laut Freigabe keine zu erhaltenden Daten enthält. Firebase-Projekte,
Nutzer, Secrets und andere Ressourcen werden dabei weder gelöscht noch
übernommen.

1. Den Release-Branch prüfen und freigeben. Ein Push eines nicht-
   `main`-Branches oder das Öffnen eines Pull Requests kann über die bestehende
   Vercel-Git-Integration ein Preview-Deployment auslösen. Dieses Preview muss
   bei `db-bpl-drehpunkt-dev` bleiben und vor dem Merge geprüft werden.
2. Vor jedem produktiven Functions-Deploy die **Namen und aktiven Versionen**
   der benötigten Secrets im Projekt `db-bpl-drehpunkt` prüfen. Fehlende
   Secrets werden dort über einen separaten, kontrollierten Set-Vorgang gesetzt;
   Dev-Werte werden nie kopiert oder ausgegeben. Der produktive
   `TOMTOM_ROUTING_API_KEY` ist mit aktiver Version vorhanden; sein Wert wird
   weder ausgelesen noch dokumentiert.
3. Den neuen Firestore-Collection-Group-Index zuerst aus dem freigegebenen
   `firestore.indexes.json` nach `db-bpl-drehpunkt` bereitstellen und den
   Abschluss des Indexaufbaus abwarten. Erst danach darf der Frist-Scheduler
   produktiv laufen:
   `firebase deploy --only firestore:indexes --project db-bpl-drehpunkt`.
4. Die geprüften Firestore- und Storage-Regeln nach `db-bpl-drehpunkt`
   bereitstellen:
   `firebase deploy --only firestore:rules,storage --project db-bpl-drehpunkt`.
5. Die Functions einschließlich Scheduler nach `db-bpl-drehpunkt`
   bereitstellen:
   `firebase deploy --only functions --project db-bpl-drehpunkt`. Danach nur
   Zustände, Scheduler-Logs und Testdaten prüfen; keine reale Mail zum Testen
   auslösen. Automatische Tracking-Mails werden ausschließlich bei erkannter
   Produktions-Runtime an gültige hinterlegte Empfänger gesendet.
6. Erst wenn Index, Regeln und Functions gesund sind, den freigegebenen Stand
   nach `main` mergen und den Vercel-Production-Deploy mit dessen sieben
   produktiven `VITE_`-Variablennamen und der Produktions-Web-App ausführen
   beziehungsweise den durch den `main`-Merge ausgelösten Deploy überwachen.
7. Nach dem Rollout Login, App Check, eine lesende Sendungsverfolgung,
   To-do-Fristen und die Aktionsübersicht prüfen. Externe E-Mails nur über den
   vorgesehenen fachlichen Betrieb auslösen, nicht als technisches Smoke-Test.

## Grenzen dieses Schritts

Der Release-Kandidat enthält versionierte Änderungen an Frontend, Functions,
Firestore- und Storage-Regeln, Indizes sowie Release-Dokumentation und wird
als Git-Commit auf einem eigenen Release-Branch geführt. Er ändert keine Werte
von Secrets oder Client-Umgebungsvariablen und führt keinen Firebase- oder
Vercel-Production-Deploy aus. Ein Preview-Deployment darf ausschließlich die
Dev-/Preview-Konfiguration verwenden.
