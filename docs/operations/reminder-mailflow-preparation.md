# Prüfung und Vorbereitung des Erinnerungs-Mailflows

Stand: 31.10.2026. **Lesend an den echten Umgebungen geprüft; Anpassungen nur
lokal vorbereitet.** Kein Flow gespeichert, erstellt oder veröffentlicht, keine
Rechte oder Secrets geändert, keine Mail versandt und kein HTTP-Mailtrigger
aufgerufen. Die eigene Editorsitzung wurde verworfen; das Änderungsdatum des
bestehenden Flows blieb bei 30.09.2026. Führender Fachvertrag:
[Zentrale Erinnerungen](reminders.md).

## Bestätigter Ist-Stand

| Gegenstand | Lesend festgestellter Stand |
| --- | --- |
| Power-Automate-Umgebung | Brennpunkt Logistik GmbH (default) |
| Allgemeiner Mailflow | [drehpunkt@ Drehpunkt auto-mail](https://make.powerautomate.com/environments/Default-b829bbdc-c0b7-4128-a341-6715a67b451b/solutions/~preferred/flows/77d7020e-076e-631f-b52d-2e14a91a523e/details), aktiv; letzte Änderung 30.09.2026 |
| Aufbau | HTTP-Anforderung → „E-Mail aus freigegebenem Postfach senden (V2)“ |
| Festes Absenderpostfach | `drehpunkt@brennpunkt-logistik.de`, Typ SharedMailbox |
| Outlook-Verbindung | `df@brennpunkt-logistik.de` |
| Exchange-Delegierung | Für dieses Verbindungskonto sind **Senden als** und **Lesen und Verwalten (Vollzugriff)** am Drehpunkt-Postfach vorhanden; keine neue Berechtigung erforderlich |
| Vorhandene Ausführungen | Erfolgreiche ältere Läufe, zuletzt sichtbar am 19.10.2026; keine neue Testausführung |
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

Die geschützten Adressen wurden nur im Arbeitsspeicher verglichen und weder
ausgegeben noch in diesen Beleg oder Git übernommen. Der Abgleich rief nur
lesende Google-Verwaltungsendpunkte auf, niemals den Mailtrigger. Ein vorhandener
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
der gelesenen Ansicht. Ein akuter Verbindungsausfall dieses Flows ist damit
**nicht bestätigt**, seine genaue physische Verbindungszuordnung aber auch noch
nicht abschließend als gesund nachgewiesen. Bei der späteren Einrichtung die
aktive Verbindung gezielt anhand ihrer ID zuordnen und prüfen; nicht allein
nach dem mehrfach vorkommenden Anzeigenamen auswählen. Das ist von den bereits
bestätigten Exchange-Send-as-Rechten zu unterscheiden. Eine Bereinigung alter
Einträge ist eine separate Aufgabe nach Prüfung ihrer Abhängigkeiten.

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
4. Bei belegtem Duplikat darf nur ein bereits gespeichertes, zum
   Inhaltsfingerabdruck passendes `accepted` erneut bestätigt werden – ohne
   neue Mail. Jeder andere Zustand oder unklarer Create-Ausgang darf niemals
   in den Versandpfad führen. Die genaue Unique-Conflict-Fehlerkennung muss am
   vorgesehenen Connector geprüft werden; ein pauschal angenommener HTTP 409
   reicht nicht. Diese Bindung ist im lokalen Plan noch offen.
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
verhindern doppelte Werte und benötigen einen Index. Die konkrete nutzbare
Site, Listen und Lizenzabdeckung wurden **noch nicht festgelegt oder geprüft**.
Eine Kostenfreiheit des gesamten HTTP-Flows wird daraus nicht abgeleitet.
Es werden jetzt keine Listen angelegt und keine Lizenzen erworben.

Der zusätzliche Regelaufwand je erfolgreicher Empfängererinnerung ist eine
Beleganlage plus eine Ergebnisaktualisierung. Die genaue Duplikatsuche wird nur
im Fehler-/Duplikatszweig verwendet. Die Listen wachsen pro Empfänger, nicht
pro Auftrag. Ihre Zugriffstrennung, indizierte Suche, Connectorlimits und
Aufbewahrung gehören zur späteren Betriebsprüfung. Der Ledger speichert nur
IDs, Fingerabdruck, Zeitpunkte und Status, keine Mailadresse, Betreff oder Texte.
Sichere Ein-/Ausgaben sind für inhaltführende Flowaktionen vorzusehen.

SharePoint und Outlook bilden keine gemeinsame Transaktion. Daher wird keine
globale Exactly-once-Zustellung behauptet. Ein Abbruch kann eine tatsächlich
versandte oder noch nicht versandte Erinnerung dauerhaft unklar lassen; die
Vermeidung automatischer Doppelversendungen hat hier Vorrang. Der Caller-Timeout
bricht einen schon laufenden Microsoft-Flow nicht zuverlässig ab, weshalb die
zweite Zeitprüfung im Provider erforderlich ist. Der Zeitpunkt der tatsächlichen
Posteingangszustellung bleibt außerhalb dieser Versandfreigabe.

## Offen vor einer später freigegebenen Veröffentlichung

- Konkrete SharePoint-Site und zwei getrennte Ledgerlisten auswählen; passende
  Serviceverbindung, minimale Listenrechte und eindeutigen Index nachweisen.
  Bestehende Send-as-Rechte weiterverwenden, keine Rechte pauschal erweitern.
- Beide Abläufe im vorgesehenen Designer erstellen und Parameterbindung,
  Schemaauswertung, Header-Groß-/Kleinschreibung, sichere Ein-/Ausgaben sowie
  Create-Conflict-/Timeout-/Replay-Pfade prüfen. Kein Connector darf ungeplant
  den Versand wiederholen; Queue-Verzögerung muss zur Ablaufprüfung führen.
- Neue geschützte Callback-Adressen ausschließlich im jeweiligen neuen
  Firebase-Secret hinterlegen. Die beiden Ziele dürfen nicht dieselbe Adresse
  verwenden. Keine URL im Frontend, Git, Prüfbericht oder in Diagnosemeldungen.
- Erst nach separater Freigabe die betroffenen Functions und den neuen
  Secretbezug gegen das ausdrücklich genannte Ziel veröffentlichen. Der
  ursprüngliche zentrale Datenaufbau und seine Freigabe bleiben erforderlich.
- Ein echter kontrollierter Versandtest benötigt eine eigene Freigabe. Dieser
  Auftrag hat ausdrücklich keinen Versandtest erlaubt. Dev- und
  Produktionsveröffentlichung bleiben getrennte Entscheidungen.

## Prüfung dieses lokalen Pakets

Die Provider- und Adaptertests verwenden ausschließlich simulierte Antworten.
Sie prüfen unter anderem getrennte Umgebungen bei gleichen Daten, geänderte
Inhalte unter gleicher Versand-ID, unzulässige Empfängerlisten, Zeitfenster,
fehlerhafte/202-Antworten, explizites Verpassen und abgebrochene Aufrufe.
Die Pläne werden auf ihre gefährlichen Pfade geprüft: kein Versand nach
Claimfehler, keine positive Bestätigung vor gespeicherter Annahme und keine
stillen Wiederholungen. Diese Prüfungen führen keine Microsoft-Ausdrücke aus
und ersetzen keine spätere Designer-/Providerabnahme.

Aktueller lokaler Nachweis: **31 Unit-/Vertrags-/Planprüfungen** und
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
