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

## Urlaubsanträge

Die persönliche Urlaubsübersicht verwendet `vacationRequests`. Ein Antrag enthält unter anderem `userId`, `startDate`, `endDate`, `days`, `status`, `type`, `note`, `createdAt` und `updatedAt`. Änderungs- und Stornoanträge werden als neue Datensätze mit `originalRequestId` sowie `changeRequest` beziehungsweise `cancellationRequest` angelegt; der ursprüngliche Antrag wird nie überschrieben. Die Anwendung lädt nur eigene Anträge und genehmigte Anträge anderer Mitarbeitender.

Feiertage werden unter `calendarHolidays` vorbereitet (`date` oder `startDate`/`endDate`, `label`). Spätere Verwaltungsfunktionen können Urlaubssperren unter `vacationBlocks` anlegen (`startDate`, `endDate`, `label`, optional `note`, `createdAt`, `updatedAt`). Beide Collections werden nur gelesen und im Kalender dezent als eigene Eintragstypen dargestellt.

Für den produktiven Einsatz müssen Firestore-Regeln Schreibzugriffe auf den eigenen Benutzer beschränken. Die Kalenderansicht benötigt Leserechte für genehmigte Anträge aller Mitarbeitenden sowie für die eigenen Anträge. Diese fachliche Sichtbarkeit muss durch geeignete Regeln oder eine serverseitige Abfrage abgesichert werden; eine reine UI-Filterung ist keine Berechtigungskontrolle.

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
