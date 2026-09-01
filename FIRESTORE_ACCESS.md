# Firestore-Zugriff in der Entwicklung

Die Anwendung verwendet Firestore für die produktiven Fachbereiche. Die Firebase-Web-Konfiguration ist bereits zentral in `src/lib/firebase.js` hinterlegt; zusätzliche Environment-Variablen sind derzeit nicht erforderlich.

## Aktueller Status

Die Firestore-Regeln des Projekts blockieren anonyme Lese- und Schreibzugriffe mit `permission-denied`. Das ist ohne implementierte Authentifizierung erwartbar und sicherer, als die Produktionsdatenbank öffentlich zu öffnen.

## Empfohlene Regel nach Einführung der Authentifizierung

Nach der Authentifizierung sollte der Zugriff mindestens angemeldete Benutzer voraussetzen:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Für die Entwicklungsphase ohne Login ist ein lokaler Firestore Emulator der sichere Weg, um Anlegen und Bearbeiten zu testen. Eine dauerhafte Regel wie `allow read, write: if true` darf nicht für das Firebase-Projekt deployed werden.

## Firebase Storage

Die Storage-Regeln müssen ebenfalls mindestens eine angemeldete Firebase-Sitzung voraussetzen:

```rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Die genannten Regeln sind als Vorbereitung dokumentiert. Sie werden nicht durch dieses Repository in Firebase ausgerollt und müssen bei Bedarf in der Firebase Console gepflegt werden.
