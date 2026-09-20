# Produktions- und Entwicklungsumgebungen

## Zielzuordnung

| Umgebung | Git-Branch | Vercel-Ziel | Firebase-Projekt | Vercel-Client-Konfiguration |
| --- | --- | --- | --- | --- |
| Produktion | `main` | Production | `db-bpl-drehpunkt` | `VITE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` für die Produktions-Web-App |
| Entwicklung | künftig `dev` | Preview/Dev | `db-bpl-drehpunkt-dev` | `VITE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` für die Entwicklungs-Web-App |

In Vercel wird der Variablenname für Production und Preview jeweils im
passenden Zielbereich hinterlegt. Der zugehörige Wert bleibt in Vercel und wird
weder in Git noch in dieser Dokumentation gespeichert. Für lokale Entwicklung
bleibt der gleiche Variablenname in einer lokalen, ignorierten `.env`-Datei.

## Aktuell verwendete Client-Konfiguration

`src/lib/firebase.js` liest derzeit ausschließlich
`VITE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY`. Die Variable konfiguriert den
öffentlichen reCAPTCHA-Enterprise-Provider für Firebase App Check und ist kein
Functions-Secret.

Die Firebase-Web-App-Zuordnung für Authentication, Firestore, Storage und
Functions stammt aktuell aus der zentralen Initialisierung in
`src/lib/firebase.js`, nicht aus `VITE_...`-Variablen. Deshalb kann die
Vercel-Preview-Konfiguration mit der oben genannten App-Check-Variable allein
noch nicht auf das Entwicklungsprojekt umschalten. Eine künftige Trennung der
Firebase-Web-App-Zuordnung benötigt einen separaten, geprüften
Initialisierungs-Änderungsschritt.

## Schutzgrenzen

- Client-`VITE_...`-Werte sind öffentliche Build-Konfiguration und dürfen keine
  Server-Secrets enthalten.
- Functions-Secrets bleiben je Firebase-Projekt serverseitig verwaltet. Dazu
  zählen insbesondere KI-Zugänge und Power-Automate-Webhooks; sie gehören
  nicht in Client-`.env`-Dateien oder Vercel-Client-Variablen.
- `.env.example` dokumentiert ausschließlich den aktuell verwendeten
  Variablennamen. Lokale `.env`-Dateien bleiben durch `.gitignore` ignoriert,
  während `.env.example` versioniert wird.

## Umfang dieses Schritts

Dieser Schritt dokumentiert nur die Zielzuordnung. Er ändert keine produktive
Laufzeitkonfiguration, keine Firebase-Web-App-Zuordnung, keine Vercel-Variable
und keine Firebase-, Functions-, Rules- oder Anwendungslogik.
