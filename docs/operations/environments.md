# Produktions- und Entwicklungsumgebungen

Stand: 28.10.2026. Führende Beschreibung der Umgebungsgrenzen im aktuellen Code.
Datierte Live-Prüfungen stehen in `documentation-inventory.md`; der Releaseweg
steht in `releases.md`. Die Zuordnung bestätigt nicht automatisch heutige
Vercel-Werte oder aktive externe Flows.

## Zielzuordnung

| Umgebung | Git-Branch | Vercel-Ziel | Firebase-Projekt | Vercel-Client-Konfiguration |
| --- | --- | --- | --- | --- |
| Produktion | `main` | Production | `db-bpl-drehpunkt` | Die sieben unten aufgeführten `VITE_`-Variablen für die Produktions-Web-App |
| Entwicklung | `dev` | Preview/Dev | `db-bpl-drehpunkt-dev` | Dieselben sieben Variablennamen mit den Werten der Entwicklungs-Web-App |

In Vercel werden diese Variablennamen getrennt für Production und Preview im
jeweils passenden Zielbereich hinterlegt. Die zugehörigen Werte bleiben in
Vercel und werden weder in Git noch in dieser Dokumentation gespeichert. Für
lokale Entwicklung werden sie in einer lokalen, ignorierten `.env.local`-Datei
gesetzt.

Für den Release-Kandidaten 2.0.0 wurde geprüft, dass Production und Preview
jeweils genau diese sieben Namen besitzen. Die Production-Konfiguration verweist
auf die Produktions-Web-App, Preview auf die Entwicklungs-Web-App; beide
besitzen unterschiedliche, passende App-Check-Site-Keys. Werte, Schlüssel und
Tokens wurden dabei nicht ausgegeben oder versioniert.

## Umgebungsbasierte Client-Konfiguration

`src/lib/firebase.js` bezieht die Firebase-Web-App-Zuordnung ausschließlich aus
diesen öffentlichen Vite-Build-Variablen:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY`

Die ersten sechs Variablen konfigurieren Authentication, Firestore, Storage und
Functions für die jeweilige Firebase-Web-App. Die siebte Variable konfiguriert
den öffentlichen reCAPTCHA-Enterprise-Provider für Firebase App Check. Fehlt
eine der sechs Firebase-Web-App-Variablen, beendet die Client-Initialisierung
mit einer Konfigurationsfehlermeldung, die nur die fehlenden Variablennamen
nennt. Es gibt keinen Fallback auf Werte des Produktionsprojekts.

## Schutzgrenzen

- Client-`VITE_...`-Werte sind öffentliche Build-Konfiguration und dürfen keine
  Server-Secrets enthalten.
- Functions-Secrets bleiben je Firebase-Projekt serverseitig verwaltet. Dazu
  zählen insbesondere KI-Zugänge und Power-Automate-Webhooks; sie gehören
  nicht in Client-`.env`-Dateien oder Vercel-Client-Variablen.
- Der allgemeine Guard in `functions/externalEffects.js` erlaubt bestimmte
  externe Wirkungen nur in der serverseitig erkannten Produktionsumgebung.
  Er ist kein globaler Schalter für alle Integrationen. Separate Pfade und
  bewusste Dev-Ausnahmen stehen in der folgenden Matrix.
- Die automatisierte News-Recherche sowie die automatische Feiertags- und
  Ferien-Synchronisierung enden in Dev erfolgreich als No-op. Die manuelle,
  rollen- und App-Check-geschützte Feiertags-/Ferien-Aktualisierung bleibt eine
  bewusste Admin-Aktion gegen öffentliche Daten-APIs.
- `.env.example` dokumentiert ausschließlich die sieben benötigten
  Variablennamen. `.env.local` bleibt durch `.gitignore` ignoriert, während
  `.env.example` versioniert wird.

## Externe Wirkungen nach Integration

Die Matrix beschreibt Codegrenzen, keine erfolgreichen Zustellungen. Erlaubte
Pfade benötigen weiterhin passende Secrets, Anbieterzugänge und Berechtigungen.

| Integration | Produktion | Entwicklung | Maßgeblicher Code in `functions/` |
| --- | --- | --- | --- |
| Automatische System-/Tracking-Mails und Fristerinnerungen | Möglich, soweit der Ablauf nicht pausiert ist | Kein automatischer Versand | `systemMails.js`, `shipmentTrackingAutomation.js`, `caseDeadlineReminders.js` |
| Manueller Tracking-Mailversand | An den hinterlegten geprüften Empfänger möglich | Bewusste Ausnahme nur für hinterlegte Empfänger mit `@brennpunkt-logistik.de`; funktionsfähiger Tracking-Webhook erforderlich | `shipmentTrackingManualDispatch.js`, `systemMails.js` |
| Systemmail-Test | Admin/Superadmin, kontrollierter eigener Empfänger | Abgewiesen | `systemMails.js` |
| AGB-Prüfer, Haftbarhaltungs-KI, News-Recherche | Über allgemeinen Production-Guard möglich | Auswertung blockiert bzw. Recherche übersprungen | `agbChecker.js`, `liabilityLetters.js`, `news.js` |
| Statusmail-Eingang | Bei Postfachanbindung und gültigem Bearer-Token möglich | Ebenfalls möglich; Dev-Flow historisch dokumentiert | `statusMailIngest.js` |
| Statusmail-KI | Eigener Secret-Pfad ohne allgemeinen Production-only-Guard | Gleicher eigener Pfad; verursacht bei Ausführung API-Aufrufe und Kosten | `statusMailAi.js` |
| TomTom-Routing, manuell und nach Import | Mit passendem Secret möglich | Ebenfalls möglich; kein allgemeiner Production-only-Guard | `transportOrderRoutes.js` |
| Automatische Feiertags-/Feriensynchronisierung | Möglich | No-op | `holidays.js` |
| Manuelle Feiertags-/Feriensynchronisierung | Admin/Superadmin gegen öffentliche APIs | Ebenfalls möglich | `holidays.js`, `schoolHolidays.js` |

Die globale Pause unter `systemSettings/automaticMailDelivery` betrifft
automatische Mailpfade, keine vollständige Abschaltung externer Dienste.
Unbekannte Runtime-Projekte werden von den allgemeinen Guards abgewiesen;
separate Pfade sind unabhängig zu beurteilen. Client-Variablen ersetzen keine
serverseitigen Projekt- oder Empfängerprüfungen.

## Lokale Arbeit und Deployment

Lokal ausschließlich die Dev-Web-App konfigurieren. Im geprüften Checkout
existiert keine `.firebaserc`; Firebase-Befehle daher mit explizitem `--project`
ausführen. Der Ordnername ändert weder Git-Repository noch Firebase-Ziel.
Ein Push nach `main` veröffentlicht nicht automatisch Functions, Rules oder
Indizes; deren Bereitstellung folgt `releases.md`.
