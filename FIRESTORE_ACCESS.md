# Firestore-Zugriff in der Entwicklung

Die Anwendung verwendet die Collection `businessPartners`. Die Firebase-Web-Konfiguration ist bereits zentral in `src/lib/firebase.js` hinterlegt; zusätzliche Environment-Variablen sind derzeit nicht erforderlich.

## Aktueller Status

Die Firestore-Regeln des Projekts blockieren anonyme Lese- und Schreibzugriffe mit `permission-denied`. Das ist ohne implementierte Authentifizierung erwartbar und sicherer, als die Produktionsdatenbank öffentlich zu öffnen.

## Empfohlene Regel nach Einführung der Authentifizierung

Nach der Authentifizierung sollte der Zugriff mindestens angemeldete Benutzer voraussetzen:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /businessPartners/{partnerId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Für die Entwicklungsphase ohne Login ist ein lokaler Firestore Emulator der sichere Weg, um Anlegen und Bearbeiten zu testen. Eine dauerhafte Regel wie `allow read, write: if true` darf nicht für das Firebase-Projekt deployed werden.
