# Prüfung und Vorbereitung des Erinnerungs-Mailflows

Aktualisierung 01.11.2026: **Dev ist inzwischen veröffentlicht und tatsächlich
angebunden**; der Dev-Providerflow ist aktiv. Sein Firebase-Scheduler verwendet
die sechs eigenen Dev-Secrets. Die Testbegrenzung in Firebase erlaubt jetzt
ausschließlich `no-reply@brennpunkt-logistik.de`. Ein neuer Test aus der echten
Firebase-Laufzeit wurde angenommen, identisch wiederholt und genau einmal im
Testpostfach mit Absender `drehpunkt@brennpunkt-logistik.de` vorgefunden.
Produktion und `main` wurden dabei nicht verändert; der vorbereitete
Produktionsflow bleibt aus. Maßgeblich ist der
[Dev-Releasebeleg](releases/reminders-dev-2026-11-01-status.md).
Die folgenden Auditwerte und Aussagen „noch nicht angelegt/ausgeschaltet“
beschreiben den historischen Vorbereitungsstand vom 31.10.2026.

Stand: 31.10.2026. Der **erste Audit war ausschließlich lesend**; seine
Editorsitzung wurde verworfen. Danach wurden ein ausdrücklich freigegebener
Einzeltest des bestehenden Flows ausgeführt und zwei getrennte SharePoint-
Versandlisten angelegt. Das neue unmanaged Solution-ZIP wurde lokal gepackt und
wieder entpackt; die neue Lösung **DrehpunktReminderTransport 1.0.0.4** wurde
erfolgreich importiert und beide neuen Flows serverseitig gespeichert. Je Umgebung
wurde ein echter Testversand ausschließlich an `no-reply@brennpunkt-logistik.de`
bestätigt. Identische Wiederholung, Inhaltskonflikt, Ablauf und falsche Identität
wurden ebenfalls tatsächlich aufgerufen, siehe Abnahmebelege unten. Beide Flows
sind danach wieder ausgeschaltet und bleiben auf die drei Testempfänger begrenzt.
Der bestehende allgemeine
Mailflow blieb unverändert, sein Änderungsdatum bei 30.09.2026. App, Firebase und
`main` wurden in dieser Vorbereitung nicht veröffentlicht. Führender Fachvertrag:
[Zentrale Erinnerungen](reminders.md).

## Bestätigter Ist-Stand

| Gegenstand | Bestätigter Stand |
| --- | --- |
| Power-Automate-Umgebung | Brennpunkt Logistik GmbH (default) |
| Allgemeiner Mailflow | [drehpunkt@ Drehpunkt auto-mail](https://make.powerautomate.com/environments/Default-b829bbdc-c0b7-4128-a341-6715a67b451b/solutions/~preferred/flows/77d7020e-076e-631f-b52d-2e14a91a523e/details), aktiv; letzte Änderung 30.09.2026 |
| Aufbau | HTTP-Anforderung → „E-Mail aus freigegebenem Postfach senden (V2)“ |
| Festes Absenderpostfach | `drehpunkt@brennpunkt-logistik.de`, Typ SharedMailbox |
| Outlook-Verbindung | `df@brennpunkt-logistik.de` |
| Exchange-Delegierung | Für dieses Verbindungskonto sind **Senden als** und **Lesen und Verwalten (Vollzugriff)** am Drehpunkt-Postfach vorhanden; keine neue Berechtigung erforderlich |
| Vorhandene Ausführungen | Erfolgreiche ältere Läufe sowie ein ausdrücklich freigegebener Einzeltest am 31.10.2026, siehe Testbeleg unten |
| Aktueller Text | `message` mit Ersetzung der Zeilenumbrüche durch `<br>`; `messageHtml` wird nicht verwendet |
| Mailaktion | Standard-Wiederholungsrichtlinie mit exponentiellen Wiederholungen; sichere Ein-/Ausgaben aus |
| Neuer Providervertrag | Keine eigene HTTP-Response, Ablaufprüfung oder dauerhafte Deduplizierung im Zweiknotenflow |

Die Exchange-Prüfung erfolgte nach der vom Nutzer selbst abgeschlossenen
Microsoft-Anmeldung. Es wurden ausschließlich vorhandene Delegierungen gelesen.
Vollzugriff allein wäre kein Beleg für Send-as; **beide** Einträge wurden separat
geprüft. Microsoft beschreibt die Trennung im
[Exchange-Berechtigungsvertrag](https://learn.microsoft.com/en-us/exchange/recipients-in-exchange-online/manage-permissions-for-recipients).

Zusätzlich wurden die aktuell an den veröffentlichten Scheduler gebundenen
Secretversionen geprüft, nicht nur ein lokaler Konfigurationswert:

| Firebase-Ziel | Aktuelle Scheduler-Bindung | Abgleich | Neuer eigener Zugang |
| --- | --- | --- | --- |
| `db-bpl-drehpunkt-dev` | `POWER_AUTOMATE_NOTIFICATION_URL`, Version 2 | Gebundene Adresse entspricht dem oben gelesenen Flow | `POWER_AUTOMATE_REMINDER_URL`: API 404, noch nicht angelegt |
| `db-bpl-drehpunkt` | `POWER_AUTOMATE_NOTIFICATION_URL`, Version 2 | Ebenfalls derselbe Flow | `POWER_AUTOMATE_REMINDER_URL`: API 404, noch nicht angelegt |

Die geschützten Adressen wurden beim Audit nur im Arbeitsspeicher verglichen und weder
ausgegeben noch in diesen Beleg oder Git übernommen. Der Abgleich rief nur
lesende Google-Verwaltungsendpunkte auf; der spätere freigegebene Mailtest ist
nachfolgend separat belegt. Ein vorhandener
erfolgreicher Altversand bestätigt weder die neue Erinnerungslogik noch eine
Zustellung an alle künftigen Empfänger.

### Zusätzlicher Verbindungsbefund

Die Verbindungsübersicht enthält mehrere ältere Office-365-/SharePoint-Einträge
für `df@`, die **„Erneut verbinden“** anzeigen. Gleichzeitig existiert eine als
**„Verbunden“** angezeigte Outlook-Verbindung
`shared-office365-479fa65f-af92-4cc3-9849-da762e3ee7a0` sowie verbundene
SharePoint-Einträge. Es wurde nichts neu verbunden, umgestellt oder gelöscht.

Der konkrete Drehpunkt-Mailflow verwendet die Lösungsreferenz
`new_sharedoffice365_cbdfb`. Deren gespeicherter Wähler zeigt `df@` an, enthält
aber mehrere gleich benannte Einträge ohne eindeutige technische Zuordnung in
der gelesenen Ansicht. Der folgende echte Einzeltest hat die im bestehenden
Flow tatsächlich gebundene Referenz inzwischen funktional bestätigt. Er macht
ältere getrennte Verbindungseinträge nicht automatisch gesund. Neue Referenzen
beim Import gezielt der vorhandenen autorisierten Verbindung zuordnen; eine
Bereinigung alter Einträge bleibt eine separate Aufgabe.

### Freigegebener Einzeltest des bestehenden Flows

| Beleg | Ergebnis |
| --- | --- |
| Zeitpunkt | `2026-10-31T20:50:48.437Z` |
| Test-ID | `4fdbf0cb-6511-44d9-affa-6994deb91621` |
| Empfänger | ausschließlich `df@brennpunkt-logistik.de` |
| Ziel | exakt der an beide bisherigen Scheduler gebundene allgemeine Altflow |
| HTTP-Ergebnis | 202; dieser Altflow besitzt weiterhin kein neues Provider-ACK |
| Eindeutiger Run | `08584081270364504820381711452cU14` |
| UI-Ergebnis | erfolgreich; Outlook-Aktion 0,6 Sekunden, Gesamtlauf 0,8 Sekunden |

Der Test bestätigt die Ausführung des gebundenen Flows samt Outlook-Aktion,
**keinen nachgewiesenen Eingang im Empfängerpostfach**. Er bestätigt weder die
neuen Reminderdefinitionen noch deren Gesamtlatenz. Der Altflow wurde dafür
nicht geändert. Weitere reale Tests sind ausschließlich für
`bb@brennpunkt-logistik.de`, `no-reply@brennpunkt-logistik.de` und
`df@brennpunkt-logistik.de` freigegeben; es gibt keine Empfängerumleitung.

### Angelegte Versandlisten und Anmeldung

Site: `https://brennpunktlogistik.sharepoint.com/sites/AdminCenter`.

| Umgebung | Listen-GUID | Spalten und Indexnachweis |
| --- | --- | --- |
| Dev | `35707354-5bed-42fc-87ee-9f301887ff05` | alle sieben Felder erforderlich angelegt; `Title` indiziert und eindeutig verifiziert |
| Produktion | `8641596a-b8f4-4746-bcc4-04533db14b2a` | alle sieben Felder erforderlich angelegt; `Title` indiziert und eindeutig im gespeicherten Formular verifiziert |

Die sieben internen Felder sind `Title`, `DeliveryId`, `PayloadDigest`, `Outcome`,
`DueAt`, `ExpiresAt` und `OutcomeAt`. Beide Listen besitzen eigene Berechtigungen;
nur die Besitzergruppe von AdminCenter ist berechtigt, derzeit ausschließlich
Dominic Franz. Es wurden keine allgemeinen Mitgliederrechte als Schreibzugang
zum Ledger übernommen.

Die aktuelle Oberfläche zeigt **Power Automate Premium**. Es wurde keine Lizenz
gekauft; die tatsächlichen Requestbudgets und nutzbaren Verbindungen bleiben vor
Normalbetrieb zu prüfen. Die PAC-Devicecode-Anmeldung wurde von Conditional Access
abgewiesen. Es erfolgte keine Richtlinienänderung oder Umgehung; Cloudaktionen
werden ausschließlich im erlaubten vorhandenen Browserzugang durchgeführt.

Die SharePoint-Website zeigt Zeitwerte standardmäßig in Pacific-Zeit an. Der
Versandvertrag verwendet ausschließlich ISO-UTC-Zeitpunkte; diese Anzeige ist
keine fachliche Terminberechnung. Die Website-Zeitzone wurde nicht geändert.

### Technische Aufrufer: registrierte getrennte Identitäten

Für diese Umsetzung wird Power Automate mit eigener zertifikatsbasierter
Microsoft-Dienstidentität verwendet. Der direkte Graph-Versand ist eine mögliche
Alternative, würde aber einen anderen Providervertrag und eng auf das
Drehpunkt-Postfach begrenzte Graph-/Exchange-Anwendungsrechte benötigen.
Die vorhandenen persönlichen Graph-Postfachverbindungen werden nicht für den
unbeaufsichtigten Erinnerungsdienst zweckentfremdet. Auch die bestehende
DyCoS-Identität erhält keine zusätzlichen Erinnerungsrechte.

Die zunächst importierten HTTP-Trigger zeigten „Jeder Benutzer in meinem
Mandanten“. Version 1.0.0.2 bindet stattdessen ausschließlich die jeweilige neue
Service-Principal-Objekt-ID in `triggerAllowedUsers` bei
`triggerAuthenticationType: User`. Eine leere Aufruferliste schränkt den
Mandanten nicht ein. „Jeder“/SAS bleibt ausgeschlossen. Der Generator verweigert
fehlende, vertauschte oder von den registrierten Identitäten abweichende IDs;
ein späterer Import darf die Einschränkung nicht unbemerkt aufheben.

| Registrierte Identität | Client-ID | Service-Principal-Objekt-ID | Einziger vorgesehener Flowzugriff |
| --- | --- | --- | --- |
| Drehpunkt Erinnerungen Dev | `01c10015-3c0c-4e57-b96a-407248cfba05` | `21b826ba-2b19-41da-8018-6af43f5c3e38` | `6e3adb39-5442-4594-a57b-cb812be70f9b` |
| Drehpunkt Erinnerungen Produktion | `4c4c751c-5536-4050-9f8f-c7ad01c52419` | `af348c83-0710-4ea0-88e9-ac460472cff1` | `c1c89a9c-8c98-46c5-9d8d-cbfad7177d65` |

Mandant: `b829bbdc-c0b7-4128-a341-6715a67b451b`. Je Identität ist ein eigenes
RSA-Zertifikat mit getrenntem privaten Schlüssel vorgesehen. Kein zusätzlicher
Graph-/Mail-/SQL-Zugriff und keine Flow-Verwaltungsrolle werden benötigt. Die
bestehende df-Outlook-Verbindung übernimmt weiterhin den autorisierten Versand.
Beide App-Registrierungen und zugehörigen Enterprise-Apps wurden nach konkreter
Nutzerfreigabe angelegt: ausschließlich dieser Mandant, ohne Umleitungs-URI.
Die automatisch vorgeschlagene delegierte Graph-Berechtigung `User.Read` wurde
bei beiden entfernt; die native Ansicht bestätigt jeweils keine konfigurierten
API-Berechtigungen. Die Registrierungsobjekte sind Dev
`ae6549d5-757c-4c6e-94c4-ec5610222d79` und Produktion
`0e70e286-6a70-4762-ac33-b2cd88c90271`; für die Triggerfreigabe ist ausdrücklich
die oben genannte **Service-Principal-Objekt-ID** maßgeblich.

Die Zertifikatsbindung wurde vom Nutzer abgeschlossen und danach nativ geprüft:
jeweils genau ein Zertifikat, passender Fingerabdruck und keine Clientgeheimnisse
oder Verbundanmeldeinformationen. Dev-Zertifikats-ID
`6af2d045-9d21-43bd-bf41-0260709b0bdc`, Produktions-Zertifikats-ID
`d6497e00-07a4-49cd-9a64-33be03c2c945`. Ein zuvor nur ausgewähltes fremdes
Zertifikat wurde nicht abgeschickt. Für die persönliche Auswahl wurden
eindeutig benannte Kopien ausschließlich der öffentlichen Zertifikate unter
`%USERPROFILE%/Downloads/Drehpunkt-Erinnerungszertifikate/` bereitgelegt:
`Drehpunkt-Erinnerungen-Dev.pem` und `Drehpunkt-Erinnerungen-Produktion.pem`.
Private Schlüssel wurden nicht dorthin kopiert. Die echte zertifikatsbasierte
Anmeldung bei Microsoft wurde anschließend mit beiden Identitäten erfolgreich
geprüft, einschließlich der festen Tenant-/Client-/Objekt-ID- und Audience-Prüfung
des lokalen Tokenproviders. Token und Assertions wurden weder ausgegeben noch
gespeichert; dieser Anmeldetest hat keine Mail ausgelöst. Zwei unterschiedliche
RSA-3072-Zertifikate sind gebunden, gültig
bis `2027-10-31T21:36:44Z`. Ablage außerhalb des Repositorys unter
`%LOCALAPPDATA%/Drehpunkt/reminder-identities/fcaf916d45bd466b984443bd4365ec8c/`,
getrennt in `development` und `production`; jeweils `public-certificate.pem`
und `private-key.pem`. Windows-Dateirechte lassen ausschließlich den aktuellen
Benutzer zu. Ausschließlich die öffentlichen Zertifikate wurden in Entra hochgeladen.
Anzeige-Thumbprints: Dev `DE9CA84D9D3D4DDC73E4E1DD5C168B15FD3D9ACD`, Produktion
`DD0215961D988E3AEC34B644870192AEF8D1C89E`. Private Schlüssel werden später
ausschließlich im jeweiligen Secret Manager verwaltet. Rechtzeitiger Austausch,
Ablaufüberwachung und Widerruf müssen zum Betriebsübergang festgelegt werden.

Lokal bindet nur der Reminder-Scheduler zusätzlich zum getrennten Callback
die Secrets `REMINDER_TENANT_ID`, `REMINDER_CLIENT_ID`,
`REMINDER_SERVICE_PRINCIPAL_ID`, `REMINDER_CERTIFICATE_PEM` und
`REMINDER_PRIVATE_KEY_PEM`. Die Werte sind je Firebase-Projekt getrennt; keine
dieser Cloudkonfigurationen wurde bereits geschrieben oder veröffentlicht.
`entraClientCredentials.js` enthält den wiederverwendbaren PS256-Signaturbaustein;
die bestehenden DyCoS-Wrapper behalten ihr Verhalten. Der Reminder-Tokenprovider
begrenzt Abrufe einschließlich Antwortlesen auf fünf Sekunden, fasst parallele
Erneuerungen zusammen und verwirft den Cache bei Konfigurations-/Schlüsselwechsel.
Audience ist fest `https://service.flow.microsoft.com/`, Scope
`https://service.flow.microsoft.com//.default`. Token, Assertions, private Schlüssel
und unbereinigte Fehlerantworten werden nicht protokolliert.

Der Reminder-Adapter versendet nur mit Bearer-Anmeldung an den gebundenen
Power-Platform-Host dieses Mandanten; SAS-Parameter, andere Hosts und
Weiterleitungen werden verweigert. Anmeldung und Versand teilen sich das
bestehende maximal zehnsekündige Zeitbudget. Zuständigkeit, Mailpause und
Fälligkeitsminute werden nach der Anmeldung unmittelbar vor dem einmaligen
Versandversuch geprüft. Ein reiner Anmeldefehler verursacht keinen Mailaufruf.

Für die manuelle Abnahme steht `scripts/test-reminder-provider.mjs` bereit.
Standard ist eine Vorschau ohne Anmeldung oder Netzwerkzugriff. Echte Ausführung
erfordert ausdrücklich `--execute`, getrennte private Konfiguration und einen
Versuchsjournalordner außerhalb jedes Git-Arbeitsbaums. Standardempfänger ist
`no-reply@brennpunkt-logistik.de`; weitere Empfänger sind ausschließlich die oben
freigegebenen Adressen. Pro Aufruf wird genau ein gewählter Fall ausgeführt:
neuer Versand, identische Wiederholung, geänderter Inhalt bei derselben ID,
abgelaufene Anforderung oder Aufruf des anderen Flows mit der falschen Identität.
Jeder echte Versuch wird vor der Anmeldung dauerhaft reserviert; ein unklarer
Ausgang darf nicht automatisch wiederholt werden. Das Werkzeug gibt weder
Callbackadresse noch Tokens oder Schlüssel aus. Die lokalen zehn Mocktests
bestätigen diese Schutzregeln, keinen echten Microsoft-Versand.

Ein HTTP-401/403 bei der falschen Identität allein belegt die Zugriffstrennung
noch nicht: Zusätzlich muss der Ausführungsverlauf zeigen, dass kein Flowlauf
gestartet ist. Auch ein passendes Versand-ACK ersetzt weder die Kontrolle der
tatsächlichen Outlook-Aktion und des Ledgers noch einen bestätigten Posteingang.

Quellen: [Microsoft-HTTP-Authentifizierung](https://learn.microsoft.com/en-us/power-automate/oauth-authentication),
[Microsoft-Sicherheitsempfehlung](https://learn.microsoft.com/en-us/power-automate/guidance/coding-guidelines/use-secure-inputs-outputs-triggers).

## Lokale Anpassung

Der Absender ist passend eingerichtet. Die fehlende Absenderberechtigung ist
damit **keine bestätigte Ursache** der bisher fehlenden Erinnerungen. Für den
neuen zentralen Dienst fehlen dagegen die oben genannten Providerfunktionen.
Der allgemeine Flow bedient auch andere Systemmails. Seine bestehenden Verträge
werden deshalb durch zwei gesonderte Erinnerungsabläufe ergänzt:

| Lokaler Entwurf | Feste Runtime | Eigenes Secret im jeweiligen Firebase-Projekt | Absender |
| --- | --- | --- | --- |
| [Dev-Plan](../../integrations/power-automate/reminders/dev.flow-plan.json) | `development` / `db-bpl-drehpunkt-dev` | `POWER_AUTOMATE_REMINDER_URL` | `drehpunkt@brennpunkt-logistik.de` |
| [Produktionsplan](../../integrations/power-automate/reminders/production.flow-plan.json) | `production` / `db-bpl-drehpunkt` | `POWER_AUTOMATE_REMINDER_URL` | dieselbe Adresse |

Die relativen Plandateien liegen ab Repositorywurzel unter
`integrations/power-automate/reminders/`. Es handelt sich ausdrücklich um
**nicht importierbare technische Ablaufpläne**, nicht um einen geprüften
Power-Automate-Export. Konkrete Aktionen, Ausdrücke, Schemas, Übergänge und
fehlende Bindungen sind enthalten. Erzeugung/Abgleich ausschließlich lokal:

```powershell
node scripts/prepare-reminder-flows.mjs --write
node scripts/prepare-reminder-flows.mjs --check
node --test scripts/prepare-reminder-flows.test.mjs
```

Zusätzlich liegen inzwischen vollständige WDL- und Solution-Generatoren vor:
`scripts/prepare-reminder-workflows.mjs` und
`scripts/prepare-reminder-solution.mjs`. Letzterer erstellt mit lokalem Microsoft
PAC ein neues unmanaged Solution-ZIP und prüft es durch erneutes Entpacken.
Diese lokale Init-/Pack-/Unpack-Prüfung war erfolgreich. Das ZIP enthält zwei
neue Flows und neue `dpr_...`-Verbindungsreferenzen, die im Importdialog den
bestehenden erlaubten Verbindungen zugeordnet werden. Es enthält keine
Callback-Secrets oder fiktiven Live-Verbindungs-IDs. XML setzt Draft/Off
(`StateCode=0`, `StatusCode=1`), JSON setzt `Stopped`, `testOnly` bleibt `true`.
Der Import von Version 1.0.0.4 und die anschließenden ausdrücklichen
Speichervorgänge im Microsoft-Designer sind erfolgreich. Die gespeicherten Trigger
wurden danach nativ geprüft: jeweils „Spezifische Benutzer in meinem Mandanten“
und ausschließlich die passende Service-Principal-ID aus der Tabelle oben.
Beide Flows sind nach der echten Versandabnahme wieder als **Aus** nachgewiesen; beim
Import wurde die Aktivierungsoption abgewählt. Die bestehenden eigenen
Verbindungsreferenzen wurden beibehalten; der Import erforderte keine
Verbindungsupdates. Die frühere Microsoft-Flowprüfung allein hatte die folgenden
erst bei Metadaten- bzw. Speicherprüfung sichtbaren Fehler nicht erkannt:
SharePoint benötigt `item/Outcome/Value`, der alte Kandidat verwendete
`item/Outcome`. Version 1.0.0.1 korrigiert Create/Patch und das Lesen des
Value-Unterpfads im Duplikatzweig. Ungespeicherte Designerproben wurden verworfen.
Eine spätere native Speicherprüfung entdeckte außerdem
`InvalidSecureDataConfiguration`: `Response`, `Compose` und `ParseJson`
unterstützen keine explizit sicheren Ausgaben. Version 1.0.0.2 setzt für diese
Typen ausschließlich sichere Eingaben; Microsoft verbirgt damit auch deren
Ausgaben. Request und verwaltete Connectoraktionen behalten sichere Ein- und
Ausgaben. Der fehlgeschlagene UI-Entwurf wurde verworfen, anschließend das
korrigierte Paket mit beiden Aufruferbindungen importiert. Quelle:
[Microsoft-Schutz unterstützter Aktionstypen](https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions#considerations-for-securing-inputs-and-outputs).
Die ausdrückliche serverseitige Speicherprüfung von 1.0.0.2 wurde
mit `ActionSchemaNotSupported` abgelehnt: `ParseJson` unterstützt zusammen mit
`OpenApiConnection` kein `pattern`/`patternProperties`. Import und Flowchecker
hatten diesen Fehler nicht erkannt. Der abgelehnte Speicherversuch hat keine
Testmail ausgelöst. Seit 1.0.0.3 entfernt der Generator diese nicht unterstützten
Schema-Schlüssel aus der WDL. Vor jeder Reservierung prüfen ausdrückliche Guards
weiterhin Hex-IDs, projektgebundenen Schlüssel, Empfänger und Betreff ohne
Zeilenumbrüche sowie exakt kanonische UTC-Zeitpunkte. Die ursprünglichen Muster
bleiben im technischen Vertragsplan dokumentiert. Die erzeugte WDL wird mit
ungültigen IDs, Adressen einschließlich Unicode-Leerzeichen, Zeilenumbrüchen
und abweichenden bzw. unmöglichen Zeitangaben geprüft.

Version 1.0.0.4 verwendet außerdem für alle Bedingungen das native Objektformat
`and/equals(<boolescher FX-Ausdruck>, true)`. Der Designer zeigte bei den zuvor
importierten reinen Ausdrucksstrings leere Bedingungsfelder. `Parse_time`
erzeugt das Zeitprüfobjekt über einen einzelnen `addProperty`-Ausdruck. Der
Testinterpreter wertet Objektbedingungen rekursiv und strikt boolesch aus;
26 Generator-/Pakettests einschließlich negativem Objektbedingungstest und
PAC-Roundtrip sind erfolgreich. Lint ist erfolgreich.

Die Power-Apps-Ansicht zeigte zeitweise eine alte Version bzw. einen laufenden
Import, obwohl die Power-Automate-Ansicht bereits 1.0.0.3 bestätigte. Der aktuelle
Import 1.0.0.4 wurde danach auch in Power Apps ausdrücklich bestätigt. Die
gespeicherten Blöcke `Validate_request` und `Dispatch` wurden für **beide** Flows
über die native Codeansicht vollständig mit dem getesteten Kandidaten verglichen.
Einzige Normalisierungen: ausgelassenes leeres `runAfter` sowie Laufzeit-
`host.connection` anstelle des ZIP-Mapkeys `host.connectionName`. Prüfungen,
Übergänge, feste Ziele, Ledgerparameter, Mailaktion und Schutzoptionen stimmen
überein. Teilweise direkte Designerproben wurden ungespeichert verworfen.
Details:
[Lokale Workflow- und Solutionpakete](../../integrations/power-automate/reminders/WORKFLOWS.md).

Der lokale Scheduler bindet nun ausschließlich das neue Erinnerungssecret;
es gibt keinen Rückfall auf den allgemeinen Mailflow. Vorlage und Empfänger
bleiben zentral im Backend. Der Request enthält Version, festes Projekt und
Umgebung, Versand-ID, projektgebundenen Schlüssel, Inhaltsfingerabdruck,
UTC-Termin und Ablaufzeit sowie die sicher erzeugten Mailinhalte.
`Idempotency-Key` entspricht `projectId:deliveryId`. Die Ablaufzeit beträgt
exakt eine Minute nach Fälligkeit. Der Fingerabdruck erkennt geänderte Inhalte,
ist aber weder Authentifizierung noch eine Signatur; der Zugang bleibt geschützt.

Nur eine synchrone HTTP-200-Antwort mit passender Version, Projektkennung,
Umgebung, Versand-ID, Fingerabdruck und festem Absender sowie
`accepted: true, outcome: "accepted"` bestätigt die Anbieterannahme. HTTP 202,
leere Antworten, abweichende Identitäten und ungeklärte Serverfehler bleiben
unklar. Explizit bestätigtes `missed` wird verpasst; ein belegter gleichidentischer
Ablehnungsstatus wird als fehlgeschlagen erfasst. Weiterleitungen sind gesperrt.
Es gibt keinen automatischen Wiederholungsversuch bei unklarem Ausgang.

## Vorgesehener Providerablauf

1. Anforderungsschema, feste Umgebung, Projekt, Absender, Versand-ID,
   `Idempotency-Key` und exakte Minutendauer prüfen. Andere Mailtypen ablehnen.
2. Bereits abgelaufene Requests ohne Versand als verpasst beantworten;
   zukünftige Requests ablehnen. Eine verspätete Verarbeitung holt nichts nach.
3. Einen dauerhaften Beleg in der festen Ledgerliste dieser Umgebung anlegen.
   `Title` enthält den projektgebundenen Schlüssel und muss **erforderlich,
   indiziert und eindeutig** sein. Nur eindeutig erfolgreiche Neuanlage mit
   Item-ID berechtigt zum einmaligen Versandversuch. Kein „suchen, dann anlegen“
   und kein Überschreiben eines vorhandenen Belegs als Reservierung.
4. Nach einem Create-Fehler darf höchstens ein lesender Lookup des exakten
   Schlüssels erfolgen. Nur ein bereits gespeichertes, zum
   Inhaltsfingerabdruck passendes `accepted` darf erneut bestätigt werden – ohne
   neue Mail. Jeder andere Zustand oder unklarer Create-Ausgang darf niemals
   in den Versandpfad führen. Bei Create-Timeout bleibt der Ausgang unklar.
   Die vollständige WDL benötigt daher keine pauschal angenommene HTTP-409-
   oder noch ungebundene Unique-Conflict-Erkennung aus den älteren Plänen.
5. Direkt vor Outlook nochmals das Zeitfenster prüfen. Die
   [Shared-Mailbox-Aktion](https://learn.microsoft.com/en-us/connectors/office365/#send-an-email-from-a-shared-mailbox-(v2))
   verwendet das feste Drehpunkt-Postfach, `to`, `subject` und **`messageHtml`**.
   Kein Klartext wird als ungeprüftes HTML eingesetzt. Für die Versandaktion
   gilt explizit **keine Wiederholung**, siehe
   [Microsoft-Retry-Vertrag](https://learn.microsoft.com/en-us/azure/logic-apps/error-exception-handling#none---no-retry-policy).
6. Erst nach erfolgreicher Outlook-Aktion den Beleg als `accepted` speichern
   und anschließend bestätigen. Bei fehlgeschlagener Ergebnisablage oder
   unklarem Connectorausgang bleibt das Ergebnis unklar. Reservierungen werden
   niemals aufgrund einer abgelaufenen Sperre erneut übernommen.

SharePoint ist hierfür als
[Standardconnector](https://learn.microsoft.com/en-us/connectors/sharepoint/)
eine vorbereitete Alternative zu einer zusätzlichen Dataverse-Abhängigkeit.
[Eindeutige Spalten](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/create-list-relationships-by-using-lookup-columns)
verhindern doppelte Werte und benötigen einen Index. Die konkrete Site und beide
Listen wurden inzwischen wie oben beschrieben angelegt. Eine Kostenfreiheit des
gesamten HTTP-Flows wird aus dem Standardconnector nicht abgeleitet; die UI zeigt
eine vorhandene Premiumlizenz. Es gab keinen Lizenzneukauf.

Der zusätzliche Regelaufwand je erfolgreicher Empfängererinnerung ist eine
Beleganlage plus eine Ergebnisaktualisierung. Die genaue Duplikatsuche wird nur
im Fehler-/Duplikatszweig verwendet. Die Listen wachsen pro Empfänger, nicht
pro Auftrag. Ihre Zugriffstrennung, indizierte Suche, Connectorlimits und
Aufbewahrung gehören zur späteren Betriebsprüfung. Der Ledger speichert nur
IDs, Fingerabdruck, Zeitpunkte und Status, keine Mailadresse, Betreff oder Texte.
Sichere Ein-/Ausgaben sind in der erzeugten WDL für inhaltführende Flowaktionen
gesetzt und nach Import im tatsächlichen Flow zu prüfen.

### Kosten, Spitzenlast und Aufbewahrung

Der normale erfolgreiche Pfad umfasst **22 WDL-Aktionen plus einen HTTP-Trigger,
also 23 Ausführungen pro Empfänger**. Darunter sind zwei SharePoint-Aufrufe
(Create und Update) sowie ein Outlook-Versand. Gemeinsame Kalender vervielfachen
diesen Aufwand pro berechtigtem Empfänger: 1.000 Empfänger bedeuten ungefähr
23.000 Ausführungen, 2.000 SharePoint-Aufrufe und 1.000 Mails. Auch interne
Variablen-, Prüf- und Kontrollaktionen sind beim tatsächlichen Requestverbrauch
zu berücksichtigen; die Messung in den Power-Automate-Analysen ist maßgeblich.
[Microsoft-Requestlimits](https://learn.microsoft.com/en-us/power-automate/limits-and-config)

Die dokumentierten Verbindungsgrenzen betragen
[600 SharePoint-Aufrufe je 60 Sekunden](https://learn.microsoft.com/en-us/connectors/sharepoint/)
und [300 Outlook-Aufrufe je 60 Sekunden](https://learn.microsoft.com/en-us/connectors/office365/).
Damit liegen höchstens theoretisch 300 erfolgreiche Empfängerversände pro Minute
innerhalb dieser beiden Grenzen. Das ist keine zugesicherte Leistung: Andere
Flows auf derselben Verbindung sowie zusätzliche SharePoint-/Exchange-Limits
reduzieren den Spielraum. Getrennte Listen und Flows trennen die Daten, erzeugen
bei gemeinsam genutzter Verbindung aber keine zusätzliche Quote.

Vor Normalbetrieb sind tatsächliche Spitzenempfängerzahl, gemeinsames
Requestbudget und Latenz des neuen vollständigen Ablaufs zu messen. Der Caller
wartet höchstens zehn Sekunden und höchstens bis zum Ende des Minutenfensters;
der alte Zweiknotenlauf ist dafür kein Lasttest. Überlast oder verspätete
Verarbeitung führt gemäß Fachvertrag zu verpassten beziehungsweise unklaren
Erinnerungen, nicht zur späteren Nachholung.

Die Ledgerlisten wachsen dauerhaft; eine automatische Aufbewahrungs-/Löschregel
ist noch nicht eingerichtet. Der Versandpfad verwendet den indizierten exakten
Schlüssel, keinen Archivscan. Die 5.000er Listenschwelle ist keine maximale
Listengröße, muss aber bei künftigen Verwaltungsansichten und Aufräumabfragen
berücksichtigt werden. Eine spätere Aufbewahrungspolitik muss Nachvollziehbarkeit,
Replay-/Zeitfensterverhalten und dauerhaft unsichere Belege berücksichtigen;
keine Löschung laufender Claims als Wiederholungsweg.
[Microsoft-Listenschwelle](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/list-view-threshold-for-large-lists-and-libraries)

SharePoint und Outlook bilden keine gemeinsame Transaktion. Daher wird keine
globale Exactly-once-Zustellung behauptet. Ein Abbruch kann eine tatsächlich
versandte oder noch nicht versandte Erinnerung dauerhaft unklar lassen; die
Vermeidung automatischer Doppelversendungen hat hier Vorrang. Der Caller-Timeout
bricht einen schon laufenden Microsoft-Flow nicht zuverlässig ab, weshalb die
zweite Zeitprüfung im Provider erforderlich ist. Der Zeitpunkt der tatsächlichen
Posteingangszustellung bleibt außerhalb dieser Versandfreigabe.

## Offen vor Normalbetrieb

- Die abgeschlossene Identitäts-/Providerabnahme unten ist keine Freigabe für
  normale Empfänger. Beide Flows bleiben `testOnly` und ausgeschaltet. Bei jeder
  späteren Änderung die gespeicherten Aufruferrechte und Schutzprüfungen erhalten.
- Ausfall-/Timeoutpfade sind lokal simuliert geprüft; tatsächliche Spitzenlast,
  lange Connectorwarteschlangen und Verbindungsabbrüche sind keine durch diese
  wenigen echten Versandtests belegte Last-/Störungsabnahme. Kein Connector darf
  ungeplant wiederholen; Queue-Verzögerung muss zur Ablaufprüfung führen.
- Neue geschützte Callback-Adressen ausschließlich im jeweiligen neuen
  Firebase-Secret hinterlegen. Die beiden Ziele dürfen nicht dieselbe Adresse
  verwenden. Keine URL im Frontend, Git, Prüfbericht oder in Diagnosemeldungen.
- Erst nach separater Freigabe die betroffenen Functions und den neuen
  Secretbezug gegen das ausdrücklich genannte Ziel veröffentlichen. Der
  ursprüngliche zentrale Datenaufbau und seine Freigabe bleiben erforderlich.
- Neue Flows dürfen für erforderliche Tests im ausdrücklich freigegebenen Rahmen
  veröffentlicht/aktiviert werden; echte Testmails ausschließlich an die drei
  oben genannten Adressen. Dieser Rahmen erlaubt keine App-/Firebase-/`main`-
  Veröffentlichung und keinen allgemeinen Versand an andere Empfänger.
- Vor Normalbetrieb Last, vorhandene Lizenz-/Requestbudgets und Aufbewahrung
  festlegen; nach Annahme durch Outlook keine Postfachzustellung behaupten.

## Prüfung dieses lokalen Pakets

Die Provider- und Adaptertests verwenden ausschließlich simulierte Antworten.
Sie prüfen unter anderem getrennte Umgebungen bei gleichen Daten, geänderte
Inhalte unter gleicher Versand-ID, unzulässige Empfängerlisten, Zeitfenster,
fehlerhafte/202-Antworten, explizites Verpassen und abgebrochene Aufrufe.
Die Pläne werden auf ihre gefährlichen Pfade geprüft: kein Versand nach
Claimfehler, keine positive Bestätigung vor gespeicherter Annahme und keine
stillen Wiederholungen. Die WDL-Tests interpretieren den erzeugten Kontrollfluss
lokal gegen simulierte Connectoren; sie verwenden keine echte Microsoft-Runtime
und ersetzen keine Designer-/Providerabnahme.

Frühere lokale Abnahme vor der OAuth-Erweiterung: **31 Unit-/Vertrags-/Planprüfungen** und
**16 Emulatorprüfungen** erfolgreich, keine übersprungen. Der Emulator umfasst
den echten Dispatcher mit echtem Adapter und simuliertem Provider, getrennte
Dev-/Produktionsbestätigungen, HTTP 202, Zeitversatz bei Providerablauf,
Wiederholungen, 501 Altquellen und mehr als 100 Reservierungen. Ein bestätigter
Providerablauf wurde dabei auch im zusammengefassten Quellstatus auf `missed`
korrigiert; er bleibt bei geringfügig abweichender Serverzeit nicht als „fällig“
stehen. Lint, Syntax-/Exportprüfung und Abgleich der 44 Shared-Module sind
erfolgreich. Das Frontend wurde in diesem Paket nicht verändert; dessen zuvor
erfolgreicher Build wurde nicht erneut ausgeführt. Keine echte Microsoft-
Connectoraktion wurde durch diese Tests ausgeführt.

Zusätzlicher Nachweis der späteren Paketvorbereitung: **22 Plan-/WDL-/Solution-
Prüfungen** erfolgreich, einschließlich echtem lokalem Microsoft-PAC-Init, Pack
und Unpack mit fiktiven Test-GUIDs. Dabei bleiben beide Definitionen, Draft-
Zustände und Solutionreferenzen erhalten. Diese Paketprüfungen führen keine
Cloudanmeldung, keinen Import und keinen Versand aus. Der oben separat belegte
autorisierte Altflow-Einzeltest ist ein realer Connectornachweis und gehört nicht
zu den simulierten oder lokalen Pakettests. Der neue Solution-UI-Import ist
inzwischen erfolgreich. Die spätere echte Versandabnahme ist unten separat belegt.

Aktueller zusätzlicher Prüfstand nach Choice-/OAuth-Änderungen: **34 gezielte
Unit-/Adapter-/Auth-/DyCoS-/Vertragsprüfungen** und **22 Plan-/WDL-/Solutionprüfungen**
erfolgreich, keine übersprungen. Außerdem **3 Dispatcher-/Provider-Integrationstests**
mit echtem lokalen Firestore-Emulator und simulierten Anmelde-/Mailantworten
erfolgreich; sie prüfen beide Umgebungen, Identität, Ablauf und unterbliebene
Wiederholung. Hier wurden bewusst keine Security Rules getestet, da der
serverseitige Admin-Dispatcher geprüft wurde. Der Emulator ist anschließend
beendet. Lint, Ladeprüfung aller 181 Function-Exporte und Abgleich der 44
Shared-Module erfolgreich. Keine
Frontendänderung in diesem Schritt; Build und neue Browserabnahme der Website
wurden nicht wiederholt. Die späteren echten Reminder-Provideraufrufe sind
nachfolgend getrennt von diesen simulierten Prüfungen dokumentiert.

## Echte Abnahme der beiden neuen Providerflows

Alle folgenden Aufrufe wurden ausdrücklich freigegeben. Ziel war ausschließlich
`no-reply@brennpunkt-logistik.de`, Absender fest
`drehpunkt@brennpunkt-logistik.de`. Testinhalte enthielten keine Fachdaten.
Fälligkeitsfenster beider synthetischen Anforderungen:
`2026-10-31T23:13:00.000Z` bis `2026-10-31T23:14:00.000Z`.

| Fall, jeweils Dev und Produktion | Echte Providerantwort | Kontrolliertes Verhalten |
| --- | --- | --- |
| Neue Versand-ID | HTTP 200, vollständig passendes `accepted` | Outlook-Aktion erfolgreich; je ein dauerhaft gespeicherter `accepted`-Beleg |
| Bytegleiche Wiederholung innerhalb der Minute | HTTP 200, dasselbe `accepted` | Vorhandenen Beleg gelesen; Mailaktion übersprungen |
| Geänderter Inhalt/Digest bei derselben ID | HTTP 200, `uncertain` | Bestehenden Beleg nicht überschrieben; Mailaktion übersprungen |
| Unveränderte Anforderung nach Ablauf | HTTP 200, `missed` | Kein Nachholen; Mailaktion übersprungen |
| Dev-Identität ruft Produktion auf und umgekehrt | HTTP 403 ohne Provider-ACK | Kein zusätzlicher Flowlauf gestartet |

Damit wurden zehn HTTP-Aufrufe ausgeführt, davon acht tatsächliche Flowläufe
(vier je Umgebung). Die beiden fremden Identitäten wurden bereits an der
Aufrufergrenze abgewiesen. Der gesamte frische Ausführungsverlauf enthält nur
die acht erwarteten Läufe. Die Tests sind kein allgemeiner Lastnachweis.

| Umgebung | Versand-ID und Ledgerzustand | Eindeutiger erster Flowlauf |
| --- | --- | --- |
| Dev | `ca0d794990efa7166838d3598773164f2ae4f1f632b1299182dbe3e18a30a6eb`, genau ein Beleg `accepted` mit Digest `4dbe561d26b1829a6e77ba58d7a6f74f925137908239ef66bb19cefcff9f476d` | [erster Dev-Test](https://make.powerautomate.com/environments/Default-b829bbdc-c0b7-4128-a341-6715a67b451b/flows/6e3adb39-5442-4594-a57b-cb812be70f9b/runs/08584081184834596321102893781CU05) |
| Produktion | `009cccadf7e0cba65dd6ab821f6780cf87f24487117c1bd06d2b0ef07e1c7f43`, genau ein Beleg `accepted` mit Digest `6f56610ffa858528a5c6256c355ce97eff82e4e072b524abc92ee1e56af97da4` | [erster Produktions-Test](https://make.powerautomate.com/environments/Default-b829bbdc-c0b7-4128-a341-6715a67b451b/flows/c1c89a9c-8c98-46c5-9d8d-cbfad7177d65/runs/08584081184834673707547778852CU21) |

Die native Mailaktion der beiden ersten Läufe ist erfolgreich. Die positiven
Läufe dauerten laut Microsoft jeweils rund vier Sekunden; der lokale Aufruf
einschließlich Anmeldung und Antwort rund 5,5 Sekunden. Die geschützten Ein- und
Ausgaben bleiben im Laufprotokoll ausgeblendet. Die tatsächlichen SharePoint-
Belege wurden nach den Negativtests frisch geladen: weiterhin genau einer je
Umgebung mit dem ursprünglichen Digest und `accepted`.

Beide Flows wurden nach den Tests wieder deaktiviert; der frisch geladene Status
ist jeweils **Aus**. Der abschließende Microsoft-Flowchecker zeigt bei beiden
**Fehler (0), Warnungen (1)**; einzige Warnung: „Flow ist deaktiviert“.
Es gab keine App-/Firebase-/`main`-Veröffentlichung und keine
Änderung am bestehenden allgemeinen Mailflow. Callback-Adressen liegen nur in
der geschützten lokalen Testkonfiguration außerhalb Git. Die getrennten neuen
Firebase-Secrets wurden nicht angelegt oder beschrieben.

Bestätigt ist die Annahme durch die echte Outlook-Aktion samt dauerhaftem
Providerbeleg, **kein unabhängig gelesener Eingang im Empfängerpostfach**.
26 aktuelle Generator-/Paketprüfungen, die zehn Mocktests des manuellen
Testwerkzeugs und Lint sind erfolgreich. Der Websiteablauf und das veröffentlichte
Firebase-Backend wurden durch diese Providerabnahme nicht verändert oder neu
im Browser abgenommen.
