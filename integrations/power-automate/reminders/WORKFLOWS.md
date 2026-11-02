# Lokale Workflowdefinitionen

Produktionsbetrieb seit 02.11.2026: Der veröffentlichte Flow besitzt die sichtbare
boolesche Variable `productionTestOnly = false`, die ausschließlich die
Testempfängerbegrenzung steuert. Authentifizierung und weitere Schutzprüfungen
bleiben erhalten. Vor Reimport aktuelles Cloudverhalten sichern; die nachfolgenden
Generatoren bleiben im sicheren Testmodus. Maßgeblich:
[Produktionsabschluss](../../../docs/operations/releases/production-2026-11-02-status.md).

Die `*.flow-plan.json` bleiben nicht importierbare Umsetzungspläne. Der separate
Generator `scripts/prepare-reminder-workflows.mjs` erzeugt vollständige WDL mit
`OpenApiConnection`, `Scope`, `If`, `runAfter` und einer abschließenden HTTP-Response.
Er erzeugt außerdem eine CreateFlow-Ressourcenhülle mit `properties.definition`,
`properties.connectionReferences` und festem `state: Stopped`.

Das ist kein Portal-Import-ZIP und keine Dataverse-Solution. Die Dateien können
als gebundene Definitions-/API-Nutzlast zur serverseitigen Validierung verwendet
werden; ein erfolgreicher Import oder Flowchecker wird lokal nicht behauptet.
Die dokumentierte Dataverse-Codeverwaltung bezieht sich auf Solution-Flows,
nicht auf eine Zusicherung des internen direkten CreateFlow-REST-Endpunkts.

## Erzeugen

`workflow-bindings.example.json` nach `bindings.local.json` kopieren. Die sieben
Felder müssen feste bestehende Bindungen enthalten: zwei Connector-Verbindungs-
**namen** (nicht Tokens oder Callback-URLs), eine HTTPS-SharePoint-Site und zwei
verschiedene Listen-GUIDs sowie die beiden unten genannten registrierten
Service-Principal-Objekt-IDs. Die aktuelle API-Hülle erwartet Verbindungsnamen als
`connectionReferences.*.connectionName`; die tatsächliche Umgebung muss diese
Zuordnung bestätigen. Ohne vollständige gültige Bindungen entstehen keine Dateien.

```text
node scripts/prepare-reminder-workflows.mjs --write --bindings integrations/power-automate/reminders/bindings.local.json
node scripts/prepare-reminder-workflows.mjs --check --bindings integrations/power-automate/reminders/bindings.local.json
node --test scripts/prepare-reminder-workflows.test.mjs
```

Standardziel ist das hier ignorierte Verzeichnis `local-workflows/`:
je Umgebung `*.workflow-definition.json` und `*.create-flow.json`, dazu ein
Manifest mit ausdrücklich noch nicht erfolgter Cloudvalidierung. Der Generator
führt keine Netzwerk-, Authentifizierungs-, Veröffentlichungs- oder Versandaktion
aus. Keine Callback-URL, Zugangsdaten oder Firebase-Konfiguration eingeben.

## Neues unmanaged Solution-ZIP für den UI-Import

`scripts/prepare-reminder-solution.mjs` verpackt dieselben beiden Definitionen mit
dem lokalen Microsoft-PAC ausschließlich über `solution init`, `solution pack`
und `solution unpack`. Keine Anmeldung, kein Cloudimport und keine Änderung an
Conditional Access gehört zu diesem Werkzeug. Es läuft ohne .NET-SDK mit dem
vorhandenen `pac.exe`; die tatsächliche lokale CLI-Version muss unterstützt sein.

`solution-bindings.example.json` nach `solution-bindings.local.json` kopieren und
Site, zwei verschiedene Listen-GUIDs und die beiden registrierten Service-
Principal-Objekt-IDs eintragen. Die embedded Connection-
IDs aus dem anderen Generator werden in diesem Modus ausdrücklich abgelehnt.
Die Site und beide Listen müssen vollständig feststehen; kein fiktiver Ersatzwert
wird für fehlende Produktionsdaten verwendet.

```text
node scripts/prepare-reminder-solution.mjs --bindings integrations/power-automate/reminders/solution-bindings.local.json --pac tmp/pac-cli/2.14.1/tools/pac.exe
node --test scripts/prepare-reminder-solution.test.mjs
```

Das ZIP entsteht unter dem ignorierten `local-solution/Run.../`. Dort bleiben auch
PAC-Quellprojekt, erneut entpacktes Prüfergebnis und `local-package-manifest.json`.
Die Solution heißt `DrehpunktReminderTransport`, ist unmanaged und enthält nur
zwei neue stabile Workflow-IDs sowie die neuen Connectionreferences
`dpr_reminders_sharedoffice365` und `dpr_reminders_sharedsharepointonline`.
Diese Referenzen werden beim UI-Import bewusst den erlaubten vorhandenen
Outlook-/SharePoint-Verbindungen zugeordnet. Es werden keine Verbindungsrechte
erweitert und keine echten oder fiktiven Live-Connection-IDs ins ZIP geschrieben.

Die Dateien folgen dem [Microsoft-Paketierungsbeispiel](https://github.com/microsoft/Industry-Links/blob/main/scripts/modules/MsIndustryLinks/package/powerPlatformSolution/PackageWorkflows.psm1):
`Other/Solution.xml` mit RootComponents vom Typ 29,
`Other/Customizations.xml` mit Workflowmetadaten und Connectionreferences,
`Workflows/*.json` mit Definition und Solutionreferenzen. Der Host nutzt dabei
`connectionName` als **Mapkey**, nicht als Live-Verbindungs-ID. Die Map verweist über
`connection.connectionReferenceLogicalName` auf die neue Solutionreferenz;
`runtimeSource` ist `embedded`, das Runtime-`authentication`-Feld entfällt. Dieser
ZIP-Exportstil ist auch in einem [Microsoft-Solutionexport](https://github.com/microsoft/CopilotStudioSamples/blob/main/infrastructure/manage-paygo/sourcecode/Workflows/PollCostandUnlinkEnvironments-AE89C8E6-2544-F111-BEC7-7C1E520AA4DF.json)
belegt. Er ist vom direkten Dataverse-Save-/APIformat zu unterscheiden.

Der Packer setzt drei Schutzschichten: XML `StateCode=0`/`StatusCode=1` (Draft/Off),
JSON `state: Stopped` und `testOnly: true` mit der Empfängerfreigabe. Die irreführenden
Statuskommentare im älteren Microsoft-Packaging-Sample werden nicht übernommen;
die Zuordnung folgt dem aktuellen Workflowvertrag. Nach lokalem Packen wird das
ZIP mit PAC wieder entpackt: Beide JSON-Definitionen, Draft-Zustände und neuen
Connectionreferences müssen erhalten bleiben. Das ist eine **lokale** Struktur-
und Roundtripprüfung, keine Bestätigung durch den Cloudimport oder Flowchecker.

Im erlaubten UI-Import Aktivierung ausgeschaltet lassen und anschließend **beide
Flows live als Off/Draft prüfen**, bevor sie bewusst für freigegebene Tests
aktiviert werden. `ImportSolution.PublishWorkflows=false` betrifft laut
[Microsoft](https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code)
klassische Workflows und ist keine alleinige Off-Garantie für Cloudflows. Auch
deren [Importverhalten](https://learn.microsoft.com/en-us/power-automate/import-flow-solution)
berücksichtigt Exportzustand und zugeordnete Verbindungen. App, Firebase, Secrets
und der vorhandene allgemeine Mailflow werden vom Paket nicht berührt.

### Persistente umgebungsspezifische Aufrufer

Beide Generatorwege setzen im HTTP-Trigger die nativ bestätigten Inputs
`triggerAuthenticationType: "User"` und `triggerAllowedUsers` als einzelne
Service-Principal-Objekt-ID im Stringformat. Diese Freigabe wird mit importiert;
ein späterer Import darf nicht auf den gesamten Mandanten zurückfallen.

| Umgebung | Client-ID (nur Zuordnung) | erforderliche Objekt-ID / Binding |
| --- | --- | --- |
| Dev | `01c10015-3c0c-4e57-b96a-407248cfba05` | `developmentServicePrincipalId`: `21b826ba-2b19-41da-8018-6af43f5c3e38` |
| Produktion | `4c4c751c-5536-4050-9f8f-c7ad01c52419` | `productionServicePrincipalId`: `af348c83-0710-4ea0-88e9-ac460472cff1` |

Diese IDs sind öffentliche Kennungen, keine Credentials. Der Builder verlangt
die beiden Bindings ausdrücklich und prüft sie gegen die registrierte Zuordnung.
Fehlende, vertauschte oder fremde IDs und Client-IDs anstelle der Objekt-IDs
brechen die Erzeugung ab. Ein Identitätswechsel erfordert eine bewusste Anpassung
dieser Zuordnung; kein leerer oder tenantweiter Ersatzwert wird erzeugt.

Ab Paketversion `1.0.0.2` gilt außerdem die unterstützte Secure-Data-Konfiguration:
`Compose`, `ParseJson` und `Response` verwenden nur `secureData.properties:
["inputs"]`. Microsoft dokumentiert für diese drei nativen Aktionen ausschließlich
Secure Inputs; damit werden auch ihre Outputs verborgen. Managed Connectoren und
der HTTP-Trigger behalten die passenden Ein-/Ausgabeschutzoptionen.
[Microsoft: unterstützte Secure-Data-Einstellungen](https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions#considerations-for-securing-inputs-and-outputs)

Paketversion `1.0.0.3` berücksichtigt den anschließend nativ bestätigten
Publishfehler `ActionSchemaNotSupported`: `pattern` und `patternProperties` sind
im Parse-JSON-Schema dieses Flows mit `OpenApiConnection` nicht zulässig. Das
erzeugte WDL-Schema enthält diese Schlüssel nicht. Die dokumentierten Schema-
Muster in den nicht importierbaren Plänen bleiben bestehen; zur Ausführung
prüfen die Guards Hex-ID und Digest ausdrücklich, den projektspezifischen Key
exakt, den Empfänger einschließlich leerer Localparts/Domainränder und sämtlicher
Whitespacezeichen des Backendvertrags sowie CR/LF im Betreff.

UTC-Termine müssen exakt den kanonischen Backendstrings entsprechen
(`yyyy-MM-ddTHH:mm:ss.fffZ`). Der `Parse_time`-Compose liefert die Tickdifferenz
und formatierte Roundtrips beider Termine; `Check_duration` vergleicht diese mit
den Originalen und verlangt weiterhin Minutengrenze und exakt 60 Sekunden.
Ungültige oder normalisierte Daten, Offsets und abweichende Präzision werden
abgelehnt. Die Tests führen diese Fälle gegen die tatsächlich erzeugte WDL aus,
auch nachdem deren Regexschema entfernt wurde. Aktionszahl und Zeitfensterprüfungen
vor Claim und Versand bleiben erhalten.

Die nativen Publishvalidatoren lehnten frühere Kandidaten trotz angezeigter
**null Flowcheckerfehler** ab. Eine solche Checkeranzeige und ein möglicherweise
noch sichtbarer alter Veröffentlichungsstatus belegen daher keinen erfolgreichen
Publish des geänderten Entwurfs. Jeder neue Import und Publish braucht den
konkreten serverseitigen Erfolg sowie die erneute Kontrolle der gespeicherten
Aufruferrechte. Die lokale PAC-Roundtripprüfung ersetzt diesen Nachweis nicht.

Ab Version `1.0.0.4` werden sämtliche `If`-Bedingungen im vom nativen Designer
bestätigten Objektformat `{ "and": [{ "equals": ["@...", true] }] }` erzeugt.
Der innere FX-Ausdruck bleibt unverändert; die boolesche rechte Seite ist echtes
`true`. Dadurch enthalten die Condition-Karten bearbeitbare Parameter, anstatt
bei einem späteren UI-Speichern eine als String importierte Bedingung zu verlieren.
Die lokalen Tests werten diese Operatorobjekte rekursiv aus und prüfen weiterhin
die negativen Versandpfade; ein Objekt wird nicht pauschal als wahr behandelt.

`Parse_time` verwendet jetzt einen einzelnen im FX-Editor setzbaren Ausdruck mit
`addProperty(addProperty(addProperty(json('{}'), ...), ...), ...)`. Er liefert
weiterhin genau das Objekt mit `durationTicks`, `dueCanonical` und
`expiresCanonical`; `Check_duration`, Anzahl der Aktionen und fachliche
Zeitprüfungen bleiben erhalten. Der tatsächliche Pack-/Import-/Save-Nachweis
für Version `1.0.0.4` und die echte Providerabnahme stehen in der führenden
[Mailflow-Vorbereitung](../../../docs/operations/reminder-mailflow-preparation.md).
Ein lokales Manifest allein bestätigt weiterhin keinen Cloudstand.

## Vor Aktivierung

- Tatsächlicher Importstand und Authentifizierungsfreigaben stehen führend in
  [Mailflow-Vorbereitung](../../../docs/operations/reminder-mailflow-preparation.md).
  Der Reminder-Adapter verlangt eine eigene zertifikatsbasierte Dienstanmeldung.
  Neue Pakete enthalten die oben festgelegten separaten Objekt-IDs. Nach dem
  Import vor Aktivierung nativ prüfen, dass ausschließlich die jeweilige ID unter
  „Spezifische Benutzer in meinem Mandanten“ gespeichert ist. Eine ältere
  Veröffentlichung oder ein bloßer UI-Entwurf ersetzt diesen Nachweis nicht.
  Eine leere Liste reicht nicht. Keine SAS-Ausweichlösung.
- Die Listen müssen die internen Spaltennamen aus den Plänen besitzen:
  `Title`, `DeliveryId`, `PayloadDigest`, `Outcome`, `DueAt`, `ExpiresAt`, `OutcomeAt`.
  `Title` muss required, indexed und EnforceUniqueValues sein. Nur Flowidentität
  und berechtigte Betreiber dürfen Belege schreiben; keine Manipulation/Löschung
  bestehender Claims als Retryweg. Adressen und Mailtexte werden nicht gespeichert.
- Die native Designer-Metadatenprüfung bestätigt für das Choice-Feld den
  Schreibparameter `item/Outcome/Value`. `Read duplicate` bietet „Outcome Value“
  als `items('For_each')?['Outcome/Value']` an. Die feste Ein-Element-Auswertung
  verwendet entsprechend `first(...)?['Outcome']?['Value']`. Die echte
  identische Wiederholung hat diesen Lookup in beiden Umgebungen bestätigt:
  passendes Accepted-ACK, vorhandener Beleg, keine neue Mailfreigabe.
- Der Generator setzt den WDL-Parameter `testOnly` standardmäßig auf `true`.
  Vor jedem Claim werden dann ausschließlich `bb@brennpunkt-logistik.de`,
  `no-reply@brennpunkt-logistik.de` und `df@brennpunkt-logistik.de` zugelassen.
  Andere Empfänger werden abgelehnt, nicht umgeleitet. Die CLI erzeugt nur diesen
  Testmodus. Der reine Builder akzeptiert `testOnly: false` als ausdrücklich
  zu setzende Option für eine spätere gesonderte Normalbetriebsfreigabe.
- Connector-Metadaten für `PostItem`, `GetItems`, `PatchItem` und
  `SharedMailboxSendEmailV2`, Slash-Parameter sowie Connectionrefs im Ziel prüfen.
  Der Absender ist fest, die Outlook-Verbindung muss zum bestätigten df-Konto gehören.
- Parse JSON und zusätzliche explizite Prüfungen schützen ID, Namespace, Header,
  Empfänger, Inhalt und UTC-Minutenfenster. Der Digest wird vom Backend berechnet;
  der Flow vergleicht ihn, er ersetzt keine Authentifizierung.
- Nur erfolgreiche Neuanlage darf senden. **Jeder** Create-Fehler erlaubt höchstens
  einen lesenden Lookup des exakt gleichen Keys; nur ein passender bereits
  akzeptierter Beleg liefert ein positives ACK, niemals erneuten Versand.
  Create-Timeout bleibt unsicher. Fehler des Lookups bleiben ebenfalls unsicher.
- Create, Send und Update haben Retry `none`. Direkt vor der Mailaktion wird das
  Zeitfenster erneut geprüft. Ein Mailfehler wird konservativ als unsicher behandelt.
  Nach erfolgreicher Mail und fehlgeschlagener Belegaktualisierung bleibt der Claim
  dauerhaft unsicher; er wird nicht erneut übernommen. `accepted` bedeutet
  Connectorannahme mit gespeichertem Beleg, keine Zusicherung der Postfachankunft.
- Die einzige Response läuft nach dem gesamten Dispatch-Scope auch bei Fehlern.
  Ausgangswert ist `uncertain`; `accepted` wird nur nach erfolgreicher
  Belegaktualisierung oder passendem gespeichertem Duplicate-ACK gesetzt.
- Validierung und Versand sind getrennte Scopes, damit der Ablauf innerhalb des
  [Power-Automate-Nestinglimits von acht Ebenen](https://learn.microsoft.com/en-us/power-automate/limits-and-config)
  bleibt. Die Tests prüfen Tiefe, Run-after-Abhängigkeiten und Ausdruckslängen.
- Die WDL definiert keine beliebige Nachholung und keinen Wiederholungszweig.
  Caller-Abbruch beendet den Flow nicht. Connector- und Zustellverzögerungen sind
  keine Echtzeitgarantie. Sichere Ein-/Ausgaben sind für sensible Schritte gesetzt.
- App/Firebase, bestehender allgemeiner Flow und Secrets bleiben durch diesen
  Generator unberührt. Reale Tests ausschließlich im separat freigegebenen Rahmen.

## Primärquellen

- [WDL-Aktionen und Kontrollfluss](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers)
- [Sichere Eingaben/Ausgaben](https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions)
- [Microsoft Power-Automate-Definitionsreferenz mit OpenApiConnection](https://github.com/microsoft/power-platform-skills/blob/main/plugins/power-automate/references/definition-reference.md)
- [Offizielles Codebeispiel und Grenzen der Dataverse-Verwaltung](https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code)
- [SharePoint-Operationen](https://learn.microsoft.com/en-us/connectors/sharepoint/)
- [Outlook-Operationen](https://learn.microsoft.com/en-us/connectors/office365/)
