# Zugriffs- und Betriebsmodell für Firestore und Storage

Stand: 28.10.2026. Diese Dokumentation beschreibt das im Repository implementierte Zugriffsmodell. Sie bestätigt keinen identischen Live-Deploy. Maßgeblich sind `firestore.rules`, `storage.rules`, `src/auth/`, `src/lib/permissions.js` und die serverseitigen Functions. Umgebungs- und Deploymentprüfungen stehen in `docs/operations/documentation-inventory.md`.

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

`superadmin` erhält im Client und in den Firestore-/Storage-Rules den `edit`-Override für alle vorhandenen Module. `admin` ist kein pauschaler Modulrechte-Override: Administrative Kontoverwaltung ist möglich, der Fachzugriff folgt aber weiterhin den Modulrechten. Die zentrale Modulliste umfasst Dashboard, Urlaub, Feiertagskalender, Kalender, Team, Stammdaten, Partner zusammenführen, Auftragsliste, Datenimporte, CRM, Palettenmanagement, News, Dokumente, Vorlagen, To-dos, Schäden, Insolvenzen, Gericht/Streit, Inkasso, Personal und AGB-Prüfer. Maßgeblich bleibt die Registrierung in `src/lib/permissions.js`.

Rolle und Berechtigungen liegen im Benutzerprofil, dürfen aber niemals direkt über Firestore durch Browser-Clients angelegt, geändert oder gelöscht werden.

## Zwei Zugriffsebenen

Die persönliche Postfach-Auftragserfassung verlangt Postfach- und
Auftragsbearbeitung sowie lesenden Stammdatenzugriff. Private Vorschauen,
Quoten und Exportbelege sind für direkte Clients gesperrt. Kontobezogene
DyCoS-IDs (`dycosReferences.accounts`, `dycosImport` und die ältere
`dycosIdentities`-Darstellung) sind serververwaltet; auch Superadmins dürfen
sie nicht direkt verändern. Der XML-Export prüft Eigentümer, aktuelle
Verbindung, genaue Debitorenreferenz und unverändertes Original-PDF erneut.
[Auftragserfassung](docs/operations/mailbox-order-capture.md) beschreibt den Vertrag.


Die eigenständigen Qualitätsmodule `kvp` und `handbook` verwenden ebenfalls
`none`/`view`/`edit`. `qualityTopics` und `qualityMeetings` einschließlich
`revisions` sind mit `kvp` lesbar, `qualityHandbook` einschließlich Verlauf mit
`handbook`. Direkte Schreibzugriffe sind gesperrt. `saveQualityRecord` prüft
aktives Profil, Bearbeitungsrecht, Abteilung und Revision transaktional und
schreibt unveränderliche Fassungen. Die Rechte gelten abteilungsübergreifend.
Details: [Qualität](docs/operations/quality.md).

Das zusätzliche Modul `mailboxes` steuert den persönlichen Mailbereich.
`view` erlaubt lesende Zugriffe auf eigene verbundene Postfächer; `edit`
zusätzlich Verknüpfen/Trennen, Entwurf speichern und explizites Antworten.
Auch ein Superadmin darf keine fremden persönlichen Postfächer abrufen.
Sämtliche `mailbox*`-Collections sind für Browserzugriffe durch Default-deny
gesperrt und werden nur durch berechtigte Functions verarbeitet. Tokens liegen
im Secret Manager, nie in Firestore. Der begrenzte Dev-Vertrag einschließlich
OAuth und Versand ist unter [Graph-Postfächer](docs/operations/mailboxes-graph.md)
dokumentiert.

| Ebene | Durchsetzung | Zweck |
| --- | --- | --- |
| Browserzugriff | Firestore- und Storage-Rules | Erzwingt aktive Profile, Rollen, Modulrechte, Eigentümerschaft und datenbezogene Validierungen für direkte SDK-Zugriffe. Eine ausgeblendete UI ersetzt diese Rules nicht. |
| Serverseitiger Zugriff | Firebase Admin SDK in Cloud Functions und Triggern | Führt privilegierte, validierte Abläufe aus. Admin-SDK-Zugriffe unterliegen nicht den Browser-Rules; client-erreichbare Callables müssen deshalb selbst Authentifizierung, aktives Profil, Rollen bzw. Modulrechte und App Check prüfen. |

Die Callables verlangen `enforceAppCheck: true`. Der datierte Quellcode-/Live-Abgleich steht in `docs/operations/documentation-inventory.md`; `APP_CHECK_ROLLOUT.md` beschreibt die zusätzliche Schutzschicht. Der HTTP-Mail-Ingest verwendet stattdessen einen serverseitigen Bearer-Token und eine Postfachprüfung. App Check ersetzt weder das aktive Profil noch Berechtigungsprüfungen.

## Firestore-Schutzgrenzen

### Benutzerprofile und Personal

- Ein Browser-Client darf sein eigenes vollständiges Profil unter `users/{uid}` nur bei aktivem Profil lesen. Direkte Listen-, Anlege-, Änderungs- und Löschzugriffe auf Benutzerprofile sind gesperrt.
- Vollständige Profile werden nicht als allgemeines Verzeichnis bereitgestellt. Reduzierte Verwaltungs- oder Verzeichnissichten stammen aus geschützten Callables.
- `employeeHrProfiles`, `hrVacationMeta` und `hrVacationAdjustments` sind für Browser-Clients vollständig gesperrt. Der Personalbereich verwendet dafür Callables mit aktivem Profil und `personnel`-Recht.
- Persönliche Urlaubsanträge können nur im zulässigen eigenen Umfang angelegt werden. Direkte Änderungen, Entscheidungen und Löschungen von `vacationRequests` sind gesperrt; Entscheidungen erfolgen serverseitig nach Prüfung der Urlaubsmanager-Zuständigkeit.
- Persönliche Notizen unter `users/{uid}/personalNotes` sind nur für den aktiven Eigentümer les- und schreibbar; die Rules validieren Inhalt und Metadaten.
- Persönliche Auftragslisten-Einstellungen werden ausschließlich über `updateOwnTransportOrderListPreferences` gespeichert. Die Callable verlangt ein aktives Profil, validiert nur die erlaubten Listenfelder und schreibt ausschließlich `userPreferences.transportOrderList` sowie dessen Änderungszeit im eigenen Profil. Rollen und Modulrechte bleiben unverändert.

### Fach- und Konfigurationsdaten

- Direkte Fachzugriffe richten sich nach dem jeweiligen Modulrecht. Die Rules beschränken dabei zusätzlich erlaubte Datenfelder und Zustandsübergänge.
- Zentrale Abteilungen sowie globale Einstellungen für Partnerbewertung und Feiertagsregion sind im Browser nur lesbar; ihre Änderung ist direkt in Firestore gesperrt.
- Die eigenen Firmenstammdaten unter `appSettings/companyMasterData` sind für aktive Profile lesbar. Direkte Browser-Schreibzugriffe sind gesperrt; die Änderung erfolgt über `updateCompanyMasterData` für aktive Admins und Superadmins.
- Systemmail-Vorlagen, KI-Prompt-Konfigurationen, Kontenmigrationen und Nutzungsprotokolle sind für Browser-Clients vollständig gesperrt.
- Inkassofälle dürfen im Browser nicht direkt angelegt werden, damit die serverseitige Fallnummernvergabe die einzige Quelle bleibt.

### Importe, Partnerzusammenführung und Aufträge

- `transportOrders` sowie deren Historie und `receivedMails` sind mit `transportOrders: view` lesbar, aber nicht direkt durch Browser schreibbar. Importänderungen und deren Freigabe werden serverseitig geprüft; Rollen und zugewiesene DyCoS-Relationen wirken je nach Aktion zusätzlich.
- Importläufe und Prüfwarteschlangen werden durch geschützte Callables bereitgestellt. Kunden-/Unternehmerprüfung erfordert `dataImports: edit` und `masterData: edit`; Zusammenführungen zusätzlich `partnerMerges: edit`. Die aktuelle Aktion bleibt für die genaue Rechtekombination maßgeblich.
- Der manuelle TA-Abruf `fetchDycosTransportOrder` benötigt App Check,
  Firebase-Anmeldung, ein aktives Profil und `dataImports: edit` (oder
  Superadmin). Auftragsleserecht allein erlaubt keinen Import. Die Antwort
  liefert Status und Dokumentreferenz, keine vollständigen SQL-Zeilen.
  Der Auftragslink und das anschließende Lesen benötigen separat
  `transportOrders: view`. `dycosImportRequests`, `dycosImportLocks` und
  `dycosImportQuotas` bleiben durch die standardmäßig verweigernden Rules
  ausschließlich serverseitig; keine neue Browser-Schreibfreigabe.
  Die erweiterte Partnerergänzung innerhalb dieses Abrufs verlangt zusätzlich
  `masterData: edit`. Ohne dieses Recht bleibt der TA-Abruf mit seiner bisherigen
  minimalen Partneranlage möglich; zusätzliche Stammdaten werden mit sichtbarem
  Hinweis ausgelassen. Ergänzungen und Konfliktmetadaten liegen beim Partner,
  nicht im allgemeinen TA-Snapshot oder in technischen Diagnosemeldungen.
- `partnerMergeOperations` ist einschließlich Untercollections für direkte Browserzugriffe gesperrt. Zusammenführung und Trennung erfolgen serverseitig. Fachobjekte behalten ihre ursprünglichen Partner-IDs; die aktuelle Identität wird über den Partnercluster aufgelöst.
- `transportOrderTrackings` und `events` sind für Auftragsleser lesbar; Änderungen und Historieneinträge erfolgen ausschließlich serverseitig. Interne Versand-/Automationsdaten haben keine allgemeine Browserfreigabe.
- `transportOrderRoutes` und `calculations` sind für Auftragsleser lesbar und nur serverseitig schreibbar. TomTom-Cache und Nutzungsdaten sind direkt gesperrt; administrative Verbrauchsübersichten stammen aus Callables.
- `transportOrderRatings` ist direkt gesperrt. Eigene Bewertungen und fachliche Auswertungen verwenden die berechtigten Callables.
- `caseTransportOrderLinks` verbindet Schäden, Inkasso und Gericht/Streit mit Aufträgen. Lesen verlangt Auftrags- und Fallzugriff, Anlegen/Löschen zusätzlich Bearbeitungsrecht des Falls. Verknüpfungen sind nicht nachträglich veränderbar und duplizieren keine Fall-/Auftragsdaten.
- Tracking-Regelkatalog, Prognose, Betriebszeiten, Ankunftsbestätigung und globale Mailpause folgen jeweils eigenen Leseregeln; direkte Änderungen sind gesperrt. Diagnoseereignisse sind ebenfalls nur über geschützte Functions zugänglich.

### Historien und Systemdaten

- Die Inkasso-Historie ist für Browser-Schreibzugriffe gesperrt. Sie wird durch Firestore-getriggerte Functions mit Auth-Kontext erzeugt und ist für berechtigte Inkasso-Nutzer nur lesbar.
- News-Recherche-Updates und KI-Nutzungsprotokolle sind im Browser nicht schreibbar.
- Urlaubsverlauf ist im Browser nicht schreibbar; lesbar ist ausschließlich der eigene Verlauf mit passendem Urlaubsrecht.
- Geschäftspartner-Historie und CRM-Bewertungen sind append-only: Berechtigte Fachnutzer können Einträge erzeugen, bestehende Einträge aber nicht direkt ändern oder löschen.

## Storage-Schutzgrenzen

Alle erlaubten direkten Storage-Pfade verlangen ein angemeldetes, aktives Profil. Fachdateien verlangen zusätzlich das jeweilige Modulrecht; persönliche Signaturen folgen der Eigentümerregel. Der gemeinsame Firmenstempel wird ausschließlich über geschützte Callables geladen und gepflegt. Nicht explizit gematchte Pfade erhalten keinen direkten Zugriff.

| Speicherbereich | Lesen | Schreiben |
| --- | --- | --- |
| Allgemeine interne Dokumente | `documents`: `view` oder `edit` | `documents`: `edit`; PDF, höchstens 20 MiB |
| Schadens-, Streit-, Inkasso- und Insolvenz-Dokumente | jeweiliges Fachmodul: `view` oder `edit` | jeweiliges Fachmodul: `edit`; PDF, höchstens 20 MiB; Fallpfade erlauben keine Objekt-Updates |
| Persönliche Signatur | nur der angemeldete Eigentümer | nur der angemeldete Eigentümer am festen eigenen Pfad; JPEG, höchstens 2 MiB |

Der gemeinsame Firmenstempel liegt am festen serverseitigen Pfad `company-assets/stamp`. `getCompanyStamp` erlaubt aktiven Profilen den Abruf; `saveCompanyStamp` und `deleteCompanyStamp` erlauben nur aktiven Admins und Superadmins Änderungen. JPG/JPEG und PNG sind bis 2 MiB zulässig. Direkte Browserzugriffe auf diesen Pfad bleiben gesperrt.

Für Insolvenz-Dokumente muss der zugehörige Insolvenzfall existieren. Für Signaturen existiert bewusst kein administrativer Storage-Zugriffspfad.

## Bewusst serverseitige Verwaltungsabläufe

Folgende Änderungen erfolgen nicht über direkte Browser-Schreibrechte:

- Kontenanlage und Kontopflege erfolgen über `createManagedUser` und `updateManagedUser`. `admin` darf reguläre `user`-Konten verwalten; `superadmin` verwaltet zusätzlich Rollen, Modulrechte und Urlaubsmanager-Zuordnungen.
- Abteilungen werden ausschließlich durch die superadmin-geschützten Callables `createDepartment` und `updateDepartment` gepflegt.
- Partnerbewertungs-Einstellungen werden ausschließlich durch `updatePartnerEvaluationSettings` für Superadmins geändert. Die Feiertagsregion wird über `updateCompanyHolidayRegion` für Admins und Superadmins validiert aktualisiert.
- Firmenstammdaten werden ausschließlich durch `updateCompanyMasterData` für aktive Admins und Superadmins validiert aktualisiert.
- Personal-, HR-Urlaubs- und manuell erfasste Urlaubsabläufe verwenden die dafür vorgesehenen Personal-Callables; direkte HR-Datenzugriffe bleiben gesperrt.
- Urlaubsmanager entscheiden Anträge über `processVacationRequest`; die Functions prüfen die berechtigte Abteilung serverseitig.
- Systemmail-Vorlagen werden ausschließlich durch Superadmins über `updateSystemMailTemplate` gepflegt. Das Auslösen einer Testmail ist auf aktive Admins und Superadmins begrenzt.
- KI-Prompt-Konfigurationen, Migrationen sowie die manuelle Feiertags- und Feriensynchronisation laufen über ihre jeweils geschützten Callables.

## Pre-Live-Tests

### Kostenoptimierungen: Paletten, Kalender und Hintergrundarbeit

Direkte Clientwrites auf `palletMovements` und `palletClosings` sind gesperrt;
die bisherigen modulabhängigen Leserechte bleiben erhalten. `savePalletRecord`
verlangt aktives Profil, App Check und `pallets: edit` bzw. Superadmin. Buchung,
Revision, Historie, Summen und Wiederholungsbeleg entstehen atomar. Die
Übersichts-Callable verlangt Paletten-Leserecht; auftragsbezogene Bewegungen
verlangen zusätzlich Transportauftrags-Leserecht. Der Summenaufbau ist allein
aktiven Superadmins erlaubt. Alte Clients mit direkten Writes benötigen eine
Aktualisierung; der Übergang steht im [Dev-Releaseplan](docs/operations/cost-efficiency-dev-release.md).

Arbeitsmengen, Aufbauzustände, Relationsverzeichnis/-belege,
Palettensummengenerationen und Mutationsbelege erhalten keine direkten
Clientrechte, auch nicht für Superadmins. `prepareBackgroundWork` ist eine
App-Check- und Superadmin-geschützte Callable; Scheduler und Trigger arbeiten
serverseitig. Keine Fachhistorie wird als Kostenmaßnahme gelöscht.

`listSystemCalendarSources` prüft die Leserechte aller angeforderten Fachmodule
und liefert nur die für Kalenderereignisse benötigten Daten im Bereich bzw.
die nächsten Termine. Kalenderrechte allein gewähren keinen Fallzugriff.
Paletten-/Kalender-Clientdiagnosen prüfen Modulrechte und feste Meldungstexte;
`background-work` ist kein erlaubtes Client-Diagnosemodul.

| Profil | Mindestprüfung |
| --- | --- |
| Standardnutzer | Anmeldung mit aktivem Profil; Zugriff ausschließlich auf zugewiesene Module; kein Zugriff auf fremde Vollprofile, HR-Daten, Systemmail-Vorlagen oder gesperrte Historien. |
| Fachrolle | Ein Modul mit `view` und ein Modul mit `edit` prüfen: Lesen, erlaubtes Schreiben, verweigertes Schreiben außerhalb des eigenen Modulrechts sowie zugehörigen Storage-Upload/-Download testen. |
| Administrator | Kontenverwaltung für reguläre Nutzer, global lesbare Einstellungen, Urlaubs- bzw. Systemmail-Ablauf gemäß Rolle prüfen; Änderungen an Rollen, Modulrechten und Superadmin-geschützten Daten als nicht berechtigt verifizieren. |
| Deaktiviertes oder fehlendes Profil | Anmeldeblockierung und verweigerten Firestore-/Storage-/Callable-Zugriff prüfen. |

## Betriebsgrenzen

Die Rules und Functions beschreiben den Anwendungszugriff. Die erstmalige Einrichtung eines vertrauenswürdigen Superadmin-Kontos, die konkrete Produktions-Identitätsverwaltung sowie Console-seitige Enforcement-Schalter sind nicht aus dem Repository ableitbar und werden hier nicht festgelegt.

## Eigenständiger Auftragsbereich (lokale Erweiterung)

Aufträge und Sendungsverfolgung verwenden gemeinsam `transportOrders`.
Die neue Auftragsliste lädt keine Trackingdaten. Auftragsaktualisierungen
verlangen zusätzlich `dataImports: edit`, Stammdatenaktualisierungen
`masterData: edit`; Gesamtaktualisierung verlangt beide Rechte. Refreshbelege
unter `transportOrders/{id}/refreshes` sind für Auftragsleser lesbar und nur
serverseitig schreibbar. Reservierungen bleiben direkt gesperrt. Diagnose
`transport-orders` verlangt Auftragsleserecht. Details und Releaseumfang:
[Auftragsbereich](docs/operations/order-workspace.md).
