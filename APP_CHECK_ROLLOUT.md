# Firebase App Check – Rollout für Drehpunkt

## Aktueller Stand

- Die Produktions- und die Entwicklungs-Web-App initialisieren App Check
  zentral in `src/lib/firebase.js` mit `ReCaptchaEnterpriseProvider`. Jede
  Umgebung verwendet ihre eigene Web-App und ihren eigenen Site-Key; Kennungen
  und Schlüssel werden nicht in Git dokumentiert.
- Die öffentliche Site-Key-Variable heißt `VITE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY`. Der Key gehört nicht in Git; die Musterdatei dokumentiert ihn. Eine lokale `.env` ist aktuell nicht vorhanden.
- Token-Aktualisierung ist aktiviert. In Vite-Entwicklung wird vor der App-Check-Initialisierung ausschließlich lokal der offizielle Firebase-Debug-Provider aktiviert; der Code wird aus dem Production-Build entfernt. Debug-Tokens werden weder gespeichert noch als `VITE_`-Variable verteilt.
- Firestore- und Storage-Rules sowie Firebase Auth, das aktive Profil und die Rollen-/Modulrechte wurden nicht verändert. App Check ist eine zusätzliche Schicht.
- Der aktuelle Functions-Bestand enthält 73 `onCall`-Endpunkte; jeder
  verwendet `enforceAppCheck: true`. Firestore-, Storage- und Auth-Trigger
  sowie Scheduler sind keine direkten Client-Endpunkte und werden nicht über
  diesen Mechanismus geschützt.
- Das App-Check-Enforcement für Firestore und Storage bleibt unverändert deaktiviert und wird in diesem Schritt nicht aktiviert. Eine spätere Aktivierung setzt die unten beschriebenen Metrik- und Ablaufprüfungen voraus.

## Ausgewählte Callable-Kontrollliste

`Frontend` bedeutet: Die aktuelle Web-App ruft die Callable direkt auf. Die
Liste ist eine fachliche Auswahl; das vollständige, versionierte Inventar wird
aus `functions/**/*.js` geprüft. Jede Callable ist technisch ein
Client-Endpunkt; daher ist auch eine nicht aktuell referenzierte Migration
geschützt. Bei allen Zeilen gilt: Firebase Auth erforderlich, aktives
Firestore-Profil erforderlich, App Check aktuell erzwungen und auch künftig
erforderlich.

| Callable | Frontend | Rollen- bzw. Modulrecht |
| --- | --- | --- |
| `analyzeCustomerOrderTerms` | Ja | `agbChecker`: view/edit oder Superadmin |
| `analyzeLiabilityTransportOrder` | Ja | `templates`: view/edit oder Superadmin |
| `confirmLegacyAccountProfile` | Ja | Superadmin |
| `createDepartment` | Ja | Superadmin |
| `createInkassoCase` | Ja | `inkasso`: edit oder Superadmin |
| `createManagedUser` | Ja | Admin oder Superadmin |
| `createPersonnelManualVacation` | Ja | `personnel`: edit oder Superadmin |
| `createPersonnelVacationAdjustment` | Ja | `personnel`: edit oder Superadmin |
| `getOwnVacationBalanceData` | Ja | aktives eigenes Profil |
| `getPersonnelEmployee` | Ja | `personnel`: view/edit oder Superadmin |
| `listAiPromptConfigs` | Ja | Superadmin |
| `listInsolvencyPartners` | Ja | `insolvencies`: edit oder Superadmin |
| `listLegacyAccountMigrationHistory` | Ja | Superadmin |
| `listLegacyAccountProfiles` | Ja | Superadmin |
| `listManagedUsers` | Ja | Admin oder Superadmin |
| `listManagedVacationRequests` | Ja | Urlaubsverwaltung |
| `listPersonnelEmployees` | Ja | `personnel`: view/edit oder Superadmin |
| `listPersonnelVacations` | Ja | `personnel`: view/edit oder Superadmin |
| `listSystemMailTemplates` | Ja | Superadmin |
| `listVisibleUserDirectory` | Ja | passende Verzeichnis-/Modulberechtigung |
| `migrateLegacyBirthDatesToPersonnel` | Nein | Superadmin |
| `migrateLegacyDamageDocuments` | Ja | Superadmin |
| `migrateLegacyDepartments` | Ja | Superadmin |
| `processVacationRequest` | Ja | Urlaubsverwaltung |
| `publishAiPromptDraft` | Ja | Superadmin |
| `refreshHolidayData` | Ja | Admin oder Superadmin |
| `refreshSchoolHolidayData` | Ja | Admin oder Superadmin |
| `replacePendingVacationRequest` | Ja | aktives eigenes Profil |
| `resetAiPromptDraft` | Ja | Superadmin |
| `runAutomatedNewsResearch` | Ja | Superadmin |
| `saveAiPromptDraft` | Ja | Superadmin |
| `sendSystemTestMail` | Ja | Admin oder Superadmin |
| `setNewsReaction` | Ja | `news`: view/edit oder Superadmin |
| `submitBugReport` | Ja | aktives Profil |
| `updateCompanyHolidayRegion` | Ja | Admin oder Superadmin |
| `updateDepartment` | Ja | Superadmin |
| `updateManagedUser` | Ja | Admin oder Superadmin |
| `updatePartnerEvaluationSettings` | Ja | Superadmin |
| `updatePersonnelEmployee` | Ja | `personnel`: edit oder Superadmin |
| `updatePersonnelManualVacation` | Ja | `personnel`: edit oder Superadmin |
| `updatePersonnelVacationMeta` | Ja | `personnel`: edit oder Superadmin |
| `updateSystemMailTemplate` | Ja | Superadmin |
| `withdrawVacationRequest` | Ja | aktives eigenes Profil |

## Vor der späteren Aktivierung von Firestore- und Storage-Enforcement

1. In der Firebase Console die jeweilige Umgebung öffnen und zu **Security > App Check > Apps** gehen. Die passende Web-App muss dort mit dem zugehörigen reCAPTCHA-Enterprise-Provider registriert sein. Keinen Provider oder Site-Key ersetzen, wenn der vorhandene Eintrag stimmt.
2. Den zugehörigen öffentlichen Site-Key als `VITE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` in der lokalen Entwicklungsumgebung und in der Production-Umgebung von Vercel setzen. Keine Debug-Tokens, OpenAI-Schlüssel oder Webhook-Secrets als `VITE_`-Variable setzen.
3. Lokal `npm run dev` starten, die Anwendung öffnen und den von Firebase in der Browser-Konsole ausgegebenen Debug-Token kopieren. In **Security > App Check > Apps**, beim Web-App-Eintrag das Mehr-Menü öffnen und **Manage debug tokens** wählen. Token mit einem lokalen Gerätenamen speichern. Der Token bleibt lokal im Browser und gehört nicht ins Repository.
4. Nach einem späteren Release zuerst die App-Check-Metriken in **Security > App Check** beobachten. Firestore-, Storage- und Authentication-Traffic muss vor dem Erzwingen überwiegend verifiziert sein.
5. Für Cloud Functions gibt es keinen separaten Console-Schalter: Nach dem späteren Deploy dieser Functions-Änderung werden alle 73 Callables wegen `enforceAppCheck: true` fehlende oder ungültige Tokens ablehnen. Daher erst deployen, wenn die veröffentlichte Web-App den Site-Key enthält und lokale Debug-Tokens getestet wurden.
6. Danach in **Security > App Check** jeweils die Metrik von **Cloud Firestore**, dann **Cloud Storage** aufklappen, **Enforce** klicken und bestätigen. Pro Dienst bis zu 15 Minuten Wirkung abwarten und die Anwendung testen.
7. **Authentication** nur anschließend und nur dann ebenfalls über **Enforce** aktivieren, wenn es in der projektbezogenen App-Check-Ansicht erscheint und die Auth-Metrik legitimen Traffic als verifiziert ausweist. Auth, die Blocking Function und die Profil-/Rollenprüfungen bleiben dabei unverändert erforderlich.

## Empfohlene Reihenfolge für die spätere Enforcement-Aktivierung

1. Site-Key-Konfiguration und lokale Debug-Token-Prüfung abschließen.
2. Die Web-App mit App Check veröffentlichen, aber die Console-Enforcement-Schalter noch nicht aktivieren.
3. Metriken für Firestore, Storage und Authentication beobachten.
4. Die Functions-Änderung erst bei nachgewiesen gültigen Client-Tokens deployen; danach Callables mit echten Benutzerrollen testen.
5. Cloud Firestore erzwingen und Lesen/Schreiben testen.
6. Cloud Storage erzwingen und Upload, Download sowie persönliche Signaturen und PDF-Dokumente testen.
7. Optional Authentication erzwingen, falls die Console die Metrik bereitstellt und sie grün ist.
8. Abschließend alle Callables, Login, Profilzugriff sowie lokale Debug-Nutzung erneut testen.

## Functions-Laden

Der Inkasso-Trigger bezieht Firestore erst im Trigger-Aufruf statt beim Modulimport. Dadurch kann der vollständige Functions-Entrypoint vor der Firebase-Initialisierung fehlerfrei geladen werden.
