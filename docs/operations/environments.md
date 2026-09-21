# Produktions- und Entwicklungsumgebungen

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
- Die Functions erlauben externe Wirkungen (Power Automate und OpenAI) nur bei
  serverseitig erkannter Runtime-Projekt-ID `db-bpl-drehpunkt`. Im Dev-Projekt
  `db-bpl-drehpunkt-dev` und bei unbekannter Projekt-ID werden diese Wirkungen
  fail-closed blockiert; Client-`VITE_`-Werte können den Schutz nicht umgehen.
- Die automatisierte News-Recherche sowie die automatische Feiertags- und
  Ferien-Synchronisierung enden in Dev erfolgreich als No-op. Die manuelle,
  rollen- und App-Check-geschützte Feiertags-/Ferien-Aktualisierung bleibt eine
  bewusste Admin-Aktion gegen öffentliche Daten-APIs.
- `.env.example` dokumentiert ausschließlich die sieben benötigten
  Variablennamen. `.env.local` bleibt durch `.gitignore` ignoriert, während
  `.env.example` versioniert wird.

## Umfang dieses Schritts

Dieser Schritt stellt ausschließlich die Client-Initialisierung auf
umgebungsbasierte Web-App-Konfiguration um. Er ändert keine Production-Werte in
Vercel oder Firebase, keine Functions-Secrets sowie keine Firebase-Functions,
Rules oder fachliche Anwendungslogik.
