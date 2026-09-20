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

## Grenzen dieses Schritts

Dieser Schritt ändert weder Firestore- oder Storage-Regeln noch Functions,
Anwendungslogik, Secrets oder produktive Konfigurationen. Er erstellt keinen
Cloud- oder Hosting-Account, führt kein Firebase- oder Vercel-Deployment aus
und erzeugt weder Commit noch Tag.
