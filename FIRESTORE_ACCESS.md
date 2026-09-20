# Zugriffs- und Betriebsmodell für Firestore und Storage

Diese Dokumentation beschreibt den im Repository implementierten Produktionsstand. Maßgeblich sind `firestore.rules`, `storage.rules`, `src/auth/`, `src/lib/permissions.js` und die serverseitigen Functions.

## Authentifizierung und aktive Profile

Ein nutzbares Konto erfüllt stets beide Bedingungen:

1. Firebase Authentication liefert eine angemeldete Sitzung.
2. Unter `users/{uid}` existiert ein Benutzerprofil mit `active: true`.

Der Client beobachtet dieses Profil nach der Anmeldung. Fehlt es, ist es nicht aktiv oder kann es nicht gelesen werden, meldet der Client die Sitzung ab. Geschützte Routen verlangen gleichzeitig Auth-Sitzung, Profil und aktiven Status. Die Blocking Function `requireActiveProfileBeforeSignIn` prüft den aktiven Profilstatus zusätzlich beim Anmelden. Client-erreichbare Functions prüfen für geschützte Abläufe ebenfalls das aktive Profil.

Ein fehlendes `active`-Feld gilt nicht als aktiv. Eine reine Firebase-Authentifizierung ohne aktives Profil gewährt daher keinen Anwendungszugriff.

## Rollen und Modulrechte

Die zulässigen globalen Rollen sind `user`, `admin` und `superadmin`. Ungültige oder fehlende Rollen werden im Client als `user` behandelt. Die Modulrechte verwenden ausschließlich die Stufen `none`, `view` und `edit`:

| Stufe | Bedeutung |
| --- | --- |
| `none` | Kein Zugriff auf das Modul. |
| `view` | Lesender Modulzugriff. |
| `edit` | Lesender und schreibender Modulzugriff, soweit die jeweilige Rule die konkrete Operation zulässt. |

`superadmin` erhält im Client und in den Firestore-/Storage-Rules den `edit`-Override für alle vorhandenen Module. `admin` ist kein pauschaler Modulrechte-Override: Administrative Kontoverwaltung ist möglich, der Fachzugriff folgt aber weiterhin den Modulrechten. Die zentrale Modulliste umfasst Dashboard, Urlaub, Feiertagskalender, Kalender, Team, Stammdaten, CRM, Palettenmanagement, News, Dokumente, Vorlagen, To-dos, Schäden, Insolvenzen, Gericht/Streit, Inkasso, Personal und AGB-Prüfer.

Rolle und Berechtigungen liegen im Benutzerprofil, dürfen aber niemals direkt über Firestore durch Browser-Clients angelegt, geändert oder gelöscht werden.

## Zwei Zugriffsebenen

| Ebene | Durchsetzung | Zweck |
| --- | --- | --- |
| Browserzugriff | Firestore- und Storage-Rules | Erzwingt aktive Profile, Rollen, Modulrechte, Eigentümerschaft und datenbezogene Validierungen für direkte SDK-Zugriffe. Eine ausgeblendete UI ersetzt diese Rules nicht. |
| Serverseitiger Zugriff | Firebase Admin SDK in Cloud Functions und Triggern | Führt privilegierte, validierte Abläufe aus. Admin-SDK-Zugriffe unterliegen nicht den Browser-Rules; client-erreichbare Callables müssen deshalb selbst Authentifizierung, aktives Profil, Rollen bzw. Modulrechte und App Check prüfen. |

Der aktuelle Functions-Bestand enthält 43 client-erreichbare Callables mit `enforceAppCheck: true`. App Check ergänzt Authentifizierung und Rules, ersetzt aber weder das aktive Profil noch die serverseitigen Berechtigungsprüfungen.

## Firestore-Schutzgrenzen

### Benutzerprofile und Personal

- Ein Browser-Client darf sein eigenes vollständiges Profil unter `users/{uid}` nur bei aktivem Profil lesen. Direkte Listen-, Anlege-, Änderungs- und Löschzugriffe auf Benutzerprofile sind gesperrt.
- Vollständige Profile werden nicht als allgemeines Verzeichnis bereitgestellt. Reduzierte Verwaltungs- oder Verzeichnissichten stammen aus geschützten Callables.
- `employeeHrProfiles`, `hrVacationMeta` und `hrVacationAdjustments` sind für Browser-Clients vollständig gesperrt. Der Personalbereich verwendet dafür Callables mit aktivem Profil und `personnel`-Recht.
- Persönliche Urlaubsanträge können nur im zulässigen eigenen Umfang angelegt werden. Direkte Änderungen, Entscheidungen und Löschungen von `vacationRequests` sind gesperrt; Entscheidungen erfolgen serverseitig nach Prüfung der Urlaubsmanager-Zuständigkeit.

### Fach- und Konfigurationsdaten

- Direkte Fachzugriffe richten sich nach dem jeweiligen Modulrecht. Die Rules beschränken dabei zusätzlich erlaubte Datenfelder und Zustandsübergänge.
- Zentrale Abteilungen sowie globale Einstellungen für Partnerbewertung und Feiertagsregion sind im Browser nur lesbar; ihre Änderung ist direkt in Firestore gesperrt.
- Systemmail-Vorlagen, KI-Prompt-Konfigurationen, Kontenmigrationen und Nutzungsprotokolle sind für Browser-Clients vollständig gesperrt.
- Inkassofälle dürfen im Browser nicht direkt angelegt werden, damit die serverseitige Fallnummernvergabe die einzige Quelle bleibt.

### Historien und Systemdaten

- Die Inkasso-Historie ist für Browser-Schreibzugriffe gesperrt. Sie wird durch Firestore-getriggerte Functions mit Auth-Kontext erzeugt und ist für berechtigte Inkasso-Nutzer nur lesbar.
- News-Recherche-Updates und KI-Nutzungsprotokolle sind im Browser nicht schreibbar.
- Urlaubsverlauf ist im Browser nicht schreibbar; lesbar ist ausschließlich der eigene Verlauf mit passendem Urlaubsrecht.
- Geschäftspartner-Historie und CRM-Bewertungen sind append-only: Berechtigte Fachnutzer können Einträge erzeugen, bestehende Einträge aber nicht direkt ändern oder löschen.

## Storage-Schutzgrenzen

Alle erlaubten Storage-Pfade verlangen ein angemeldetes, aktives Profil und das jeweilige Modulrecht. Nicht explizit gematchte Pfade erhalten keinen Zugriff.

| Speicherbereich | Lesen | Schreiben |
| --- | --- | --- |
| Allgemeine interne Dokumente | `documents`: `view` oder `edit` | `documents`: `edit`; PDF, höchstens 20 MiB |
| Schadens-, Streit-, Inkasso- und Insolvenz-Dokumente | jeweiliges Fachmodul: `view` oder `edit` | jeweiliges Fachmodul: `edit`; PDF, höchstens 20 MiB; Fallpfade erlauben keine Objekt-Updates |
| Persönliche Signatur | nur der angemeldete Eigentümer | nur der angemeldete Eigentümer am festen eigenen Pfad; JPEG, höchstens 2 MiB |

Für Insolvenz-Dokumente muss der zugehörige Insolvenzfall existieren. Für Signaturen existiert bewusst kein administrativer Storage-Zugriffspfad.

## Bewusst serverseitige Verwaltungsabläufe

Folgende Änderungen erfolgen nicht über direkte Browser-Schreibrechte:

- Kontenanlage und Kontopflege erfolgen über `createManagedUser` und `updateManagedUser`. `admin` darf reguläre `user`-Konten verwalten; `superadmin` verwaltet zusätzlich Rollen, Modulrechte und Urlaubsmanager-Zuordnungen.
- Abteilungen werden ausschließlich durch die superadmin-geschützten Callables `createDepartment` und `updateDepartment` gepflegt.
- Partnerbewertungs-Einstellungen werden ausschließlich durch `updatePartnerEvaluationSettings` für Superadmins geändert. Die Feiertagsregion wird über `updateCompanyHolidayRegion` für Admins und Superadmins validiert aktualisiert.
- Personal-, HR-Urlaubs- und manuell erfasste Urlaubsabläufe verwenden die dafür vorgesehenen Personal-Callables; direkte HR-Datenzugriffe bleiben gesperrt.
- Urlaubsmanager entscheiden Anträge über `processVacationRequest`; die Functions prüfen die berechtigte Abteilung serverseitig.
- Systemmail-Vorlagen werden ausschließlich durch Superadmins über `updateSystemMailTemplate` gepflegt. Das Auslösen einer Testmail ist auf aktive Admins und Superadmins begrenzt.
- KI-Prompt-Konfigurationen, Migrationen sowie die manuelle Feiertags- und Feriensynchronisation laufen über ihre jeweils geschützten Callables.

## Pre-Live-Tests

| Profil | Mindestprüfung |
| --- | --- |
| Standardnutzer | Anmeldung mit aktivem Profil; Zugriff ausschließlich auf zugewiesene Module; kein Zugriff auf fremde Vollprofile, HR-Daten, Systemmail-Vorlagen oder gesperrte Historien. |
| Fachrolle | Ein Modul mit `view` und ein Modul mit `edit` prüfen: Lesen, erlaubtes Schreiben, verweigertes Schreiben außerhalb des eigenen Modulrechts sowie zugehörigen Storage-Upload/-Download testen. |
| Administrator | Kontenverwaltung für reguläre Nutzer, global lesbare Einstellungen, Urlaubs- bzw. Systemmail-Ablauf gemäß Rolle prüfen; Änderungen an Rollen, Modulrechten und Superadmin-geschützten Daten als nicht berechtigt verifizieren. |
| Deaktiviertes oder fehlendes Profil | Anmeldeblockierung und verweigerten Firestore-/Storage-/Callable-Zugriff prüfen. |

## Betriebsgrenzen

Die Rules und Functions beschreiben den Anwendungszugriff. Die erstmalige Einrichtung eines vertrauenswürdigen Superadmin-Kontos, die konkrete Produktions-Identitätsverwaltung sowie Console-seitige Enforcement-Schalter sind nicht aus dem Repository ableitbar und werden hier nicht festgelegt.
