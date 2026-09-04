# Firestore-Zugriff in der Entwicklung

Die Anwendung verwendet Firestore für die produktiven Fachbereiche. Die Firebase-Web-Konfiguration ist bereits zentral in `src/lib/firebase.js` hinterlegt; zusätzliche Environment-Variablen sind derzeit nicht erforderlich.

## Rollen- und Berechtigungsmodell

Die produktiven Regeln liegen nun in `firestore.rules` und `storage.rules`; sie werden über `firebase.json` ausgerollt. Sie prüfen die Modulrechte auf dem Benutzerprofil und verbieten sämtliche Client-Änderungen an `role` und `permissions`. Benutzeranlage sowie Änderungen an Rollen und Berechtigungen laufen ausschließlich über die Callable Functions in `functions/index.js`.

Vor dem ersten Deployment muss ein bestehendes vertrauenswürdiges Konto einmalig als `superadmin` im Profil `users/{uid}` angelegt werden. Danach werden alle weiteren Änderungen nur noch über die Anwendung bzw. die Functions vorgenommen. Für die Functions zuerst in `functions/` die Abhängigkeiten installieren und anschließend `firebase deploy --only firestore:rules,storage,functions` ausführen.

## Aktueller Status

Die Firestore-Regeln des Projekts blockieren anonyme Lese- und Schreibzugriffe mit `permission-denied`. Das ist ohne implementierte Authentifizierung erwartbar und sicherer, als die Produktionsdatenbank öffentlich zu öffnen. Die produktiven Regeln und Indizes werden über `firebase deploy --only firestore:rules,firestore:indexes` ausgerollt.

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

Das Urlaubsmanagement ist über die Benutzerfelder `vacationManager`, `vacationManagerAllDepartments` und `vacationManagerDepartments` abgesichert. `vacationManagerDepartments` enthält ausschließlich IDs aus der zentralen Collection `departments`. Die Callable Functions `listManagedVacationRequests` und `processVacationRequest` prüfen die Zuständigkeit des angemeldeten Managers anhand der Abteilungs-ID des Antragstellers erneut serverseitig. Genehmigung und Ablehnung erfolgen ausschließlich darüber; Firestore-Clients dürfen Anträge nicht direkt aktualisieren oder löschen.

## Zentrale Abteilungen

Abteilungen liegen zentral unter `departments/{id}` mit `id`, `name`, `normalizedName`, `active`, `createdAt` und `updatedAt`. Anlegen, Umbenennen sowie Aktivieren/Deaktivieren ist ausschließlich über die Superadmin-Callable-Functions `createDepartment` und `updateDepartment` möglich. Benutzer speichern `departmentId`; die Felder `department` und `departmentName` bleiben für bestehende Ansichten als lesbare Spiegelwerte erhalten.

`migrateLegacyDepartments` kann vorhandene Freitext-Abteilungen und frühere Urlaubsmanager-Zuständigkeiten in die zentrale Struktur übernehmen. Die Benutzerliste lädt jedoch immer unabhängig davon; alte Profile bleiben mit ihrem bisherigen Abteilungsnamen sichtbar.

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

Die Storage-Regeln werden getrennt über `firebase deploy --only storage` ausgerollt.

## News-Recherche

Die geplante News-Recherche nutzt weiterhin `OPENAI_API_KEY`. Damit Superadmins bei einem Fehlschlag per E-Mail informiert werden, muss zusätzlich derselbe Power-Automate-Webhook wie für `/api/notifications` als Firebase-Secret gesetzt werden:

```powershell
firebase functions:secrets:set POWER_AUTOMATE_NOTIFICATION_URL
```

Anschließend die Functions deployen. Empfänger werden bei jedem Fehler dynamisch aus aktiven Profilen mit der Rolle `superadmin` und gültiger E-Mail-Adresse ermittelt.

## To-dos

To-dos liegen unter `todos/{todoId}`. Sie verwenden `creatorUserId`/`creatorName`, `audienceType` (`all`, `department`, `person`), `audienceId`, `audienceLabel`, die unabhängigen Bearbeiterfelder `assignedUserId`/`assignedUserName`/`assignedAt` sowie den Status `open`, `in_progress`, `completed` oder `withdrawn`.

Die Firestore-Regeln erlauben Leserechte nur für berechtigte Benutzer, die jeweils Ersteller, Bearbeiter oder Teil der Zielgruppe sind; zurückgezogene Einträge bleiben Ersteller und Superadmin vorbehalten. Übernahmen, Freigaben und Erledigungen prüfen die zulässigen Statuswechsel und den aktuellen Benutzer. Client-Hard-Deletes sind verboten. Die Abfragen für Zielgruppen verwenden die Composite-Indizes aus `firestore.indexes.json`.
