# Sicherheitsleitlinie für Drehpunkt

Diese Leitlinie ist für jede Änderung am Drehpunkt-Projekt verbindlich. Sicherheit wird serverseitig durchgesetzt; eine UI-Sperre allein ist niemals ausreichend.

## Geheimnisse und Zugangsdaten

- Secrets, Passwörter, API-Keys, Service-Account-Dateien und Webhook-URLs dürfen weder in Git noch im Frontend oder in Firestore gespeichert werden.
- Secrets werden ausschließlich über den vorgesehenen Secret-Manager und serverseitige Functions verwendet.
- Externe Portalzugänge dürfen nie im Klartext gespeichert oder angezeigt werden. Sie sind nur über einen dafür vorgesehenen, sicheren Mechanismus zu verwalten.

## Zugriff und Berechtigungen

- Es gibt keine öffentliche Registrierung. Benutzerkonten werden ausschließlich über die freigegebene Administration angelegt.
- Nur aktive Nutzer mit einem gültigen Benutzerprofil dürfen auf Anwendungsdaten zugreifen.
- Rollen und Berechtigungen sind bei jeder sicherheitsrelevanten Aktion serverseitig zu prüfen. Frontend-Prüfungen dienen nur der Bedienbarkeit und ersetzen keine Autorisierung.
- Firestore und Storage bleiben standardmäßig gesperrt. Zugriff wird nur für den konkreten, notwendigen Anwendungsfall gezielt in Rules freigegeben.

## Functions, Webhooks und Eingaben

- Cloud Functions und Webhooks müssen den Aufrufer bzw. Empfänger authentifizieren, Berechtigungen prüfen und alle Eingaben serverseitig validieren.
- Event-getriebene Functions müssen idempotent sein, damit Wiederholungen keine doppelten Nebenwirkungen erzeugen.
- Systemmails dürfen ausschließlich über `functions/systemMails.js` versendet werden. Es darf keine Client-zu-Power-Automate-Mailroute geben.
- E-Mail-HTML wird ausschließlich serverseitig aus Klartext erzeugt. Vorlagen- und Platzhalterwerte müssen dabei HTML-sicher escaped werden; HTML aus dem Admin-Editor wird niemals ungefiltert übernommen.

## Checkliste vor Merge und Deployment

- [ ] Keine Secrets, Klartextzugänge oder Webhook-URLs in Diff, Frontend, Firestore-Datenmodell oder Logs.
- [ ] Neue oder geänderte Zugriffe sind serverseitig autorisiert und in Firestore-/Storage-Rules minimal freigegeben.
- [ ] Functions und Webhooks validieren Eingaben und sind bei Events idempotent.
- [ ] `npm run lint`, `npm run build` und passende Tests/Syntaxprüfungen sind erfolgreich.
- [ ] Geänderte Firestore- oder Storage-Rules wurden vor dem Deployment geprüft.
- [ ] Deployment erfolgt nur in das vorgesehene Firebase-Projekt und nur mit den benötigten Komponenten.
