# Status-Postfach: Eingang und KI-Auswertung

Dev-Freigabe 05.11.2026: Das gesammelte Zeitregel-/Antwortpaket wird gemeinsam
veröffentlicht. Aktueller Nachweis und Abnahmegrenzen im
[Releasebeleg](releases/status-replies-dev-2026-11-05.md). Die unten dokumentierten
lokalen Prüfstände gingen dieser Freigabe voraus; Main/Produktion bleiben unverändert.

Stand: 28.10.2026. Datenvertrag und Verarbeitung entsprechen dem geprüften
Code. Die folgende Flow-Einrichtung und die damaligen manuellen Prüfungen
beziehen sich auf Dev. Die Functions sind auch im Produktionsinventar vorhanden;
ein aktiver produktiver Postfachflow ist damit nicht nachgewiesen. Die aktuelle
Anbindung je Umgebung muss separat geprüft werden. Umgebungsgrenzen:
`environments.md`; ausgehende Mails: `../../functions/SYSTEM_MAILS.md`.

## Umfang

Der erste Schritt verarbeitet neue Mails aus dem freigegebenen Postfach
`status@brennpunkt-logistik.de`. Eine Mail wird nur gespeichert, wenn ihr Betreff
genau eine TA-Nummer im Format `TA 260900123` oder `Transportauftrag 260900123`
enthält. Auch ein alleinstehender TA-Betreff wie `260900123` wird akzeptiert –
einschließlich üblicher Antwort-, Weiterleitungs- und Systempräfixe wie
`WG:`, `AW:`, `RE:`, `FW:` oder `[EXTERN]`. `transportOrders.externalNumber`
muss dabei genau einen Auftrag liefern.
Nicht zuordenbare Mails werden mit HTTP 200 (`unmatched`) quittiert und nicht
gespeichert. Gleiche Nachrichten werden nur einmal gespeichert (`duplicate`).
Zugeordnete Mails aus diesem Postfach werden anschließend in Dev auf eindeutige
Statusangaben geprüft. Angaben zu ETA, Ist-Zeiten und Kennzeichen mit hoher
Sicherheit werden automatisch in die Sendungsverfolgung übernommen. Die Quelle
wird am Wert und im Verlauf als **KI · Status-Postfach** sichtbar.

## Firebase Dev vorbereiten

Zielprojekt: `db-bpl-drehpunkt-dev`, Region: `europe-west3`.

1. Zwei Secrets ausschließlich im **Dev-Projekt** setzen:
   `STATUS_MAIL_INGEST_TOKEN` (ein zufälliger, langer Wert) und
   `STATUS_MAILBOX_ADDRESS` (`status@brennpunkt-logistik.de`).
2. Function `ingestStatusMail` und Firestore-Rules in Dev deployen.
3. Den Dev-Endpunkt verwenden:
   `https://europe-west3-db-bpl-drehpunkt-dev.cloudfunctions.net/ingestStatusMail`.

Der Token gehört nur in Secret Manager und die geschützte Power-Automate-Aktion.
Er darf nicht in Git, Vercel-Client-Variablen oder im Chat stehen.
Der Endpunkt ist von außen erreichbar und weist jeden Aufruf ohne gültigen
Bearer-Token ab. Die Auftragsansicht zeigt die 50 neuesten zugeordneten Mails.

Im Dev-Projekt war `POWER_AUTOMATE_TRACKING_NOTIFICATION_URL` vor dem Deploy
nicht gesetzt. Für die Firebase-CLI wurde dort ein absichtlich ungültiger
Platzhalter (`https://example.invalid/disabled-in-dev`) hinterlegt. Er ist
kein funktionsfähiger Ausgangs-Webhook; der Dev-Versandpfad bleibt geschlossen.

## Flow anlegen

Veröffentlichter Flow in Power Automate: **DEV | Status-Postfach → Firebase TA-Mails**
([Flow öffnen](https://make.powerautomate.com/environments/Default-b829bbdc-c0b7-4128-a341-6715a67b451b/flows/13d4cc0a-19bd-f111-aaae-6045bd93bcb8?v3=true)).
Der Dev-Token wurde eingetragen, der Flow am 1. Oktober 2026 veröffentlicht
und auf der Detailseite mit Status **Ein** bestätigt. Ein echter Maildurchlauf
mit `TA 260900257` lief erfolgreich durch; die Mail wurde dem Auftrag
zugeordnet und vom Nutzer in der Auftragsansicht bestätigt.

1. **Automatisierter Cloud-Flow** mit Office 365 Outlook →
   **When a new email arrives in a shared mailbox (V2)** erstellen.
2. **Original Mailbox Address:** `status@brennpunkt-logistik.de`.
   **Folder:** `Inbox`/`Posteingang` des freigegebenen Postfachs.
   **Include Attachments:** `No`. Keine Betreff- oder Absenderfilter setzen,
   da die eindeutige Zuordnung serverseitig geprüft wird.
3. Aktion **Content Conversion → Html to text** hinzufügen; Inhalt:
   dynamisches Feld **Body** aus dem Trigger.
4. Aktion **HTTP** hinzufügen. Methode `POST`, URI: Dev-Endpunkt,
   Header `Content-Type: application/json` und
   `Authorization: Bearer <Dev-Token>`. Für die HTTP-Aktion sichere Eingaben
   und Ausgaben aktivieren sowie **Inhaltsübertragung/Segmentierung** ausschalten.
   Im veröffentlichten Flow ist der Dev-Token im Authorization-Header
   hinterlegt. Den Wert nicht in Dokumentation oder Chat kopieren.
5. Den HTTP-Body als **einen Ausdruck** eingeben, damit Sonderzeichen und
   Zeilenumbrüche im Mailtext korrekt als JSON übertragen werden:

   ```text
   addProperty(addProperty(addProperty(addProperty(addProperty(addProperty(addProperty(addProperty(addProperty(addProperty(addProperty(addProperty(json('{}'),'mailbox','status@brennpunkt-logistik.de'),'messageId',if(empty(triggerOutputs()?['body/internetMessageId']),triggerOutputs()?['body/id'],triggerOutputs()?['body/internetMessageId'])),'subject',triggerOutputs()?['body/subject']),'sender',triggerOutputs()?['body/from']),'bodyText',body('HTML_zu_Text')),'receivedAt',triggerOutputs()?['body/receivedDateTime']),'outlookMessageId',triggerOutputs()?['body/id']),'internetMessageId',triggerOutputs()?['body/internetMessageId']),'conversationId',triggerOutputs()?['body/conversationId']),'replyTo',triggerOutputs()?['body/replyTo']),'toRecipients',triggerOutputs()?['body/toRecipients']),'ccRecipients',triggerOutputs()?['body/ccRecipients'])
   ```

   Im veröffentlichten Dev-Flow ist dieser Ausdruck hinterlegt. Er verwendet:

   | JSON-Feld | Power-Automate-Wert |
   | --- | --- |
   | `mailbox` | `status@brennpunkt-logistik.de` (fester Wert) |
   | `messageId` | **Internet Message Id**; falls im Trigger leer: **Message Id** |
   | `subject` | **Subject** |
   | `sender` | **Von** (`body/from`) |
   | `bodyText` | Ausgabe von **Html to text** |
   | `receivedAt` | **Received Time** (ISO-Zeitstempel) |
   | `outlookMessageId` | Outlook **Message Id** für eine spätere Antwort |
   | `internetMessageId` | **Internet Message Id** |
   | `conversationId` | **Conversation Id** |
   | `replyTo` | **Reply To** |
   | `toRecipients`, `ccRecipients` | **To**, **CC** |

Der veröffentlichte Dev-Flow übergibt diese zusätzlichen Felder. Die
HTTP-Aktion wurde danach mit **0 Fehlern, 0 Warnungen** geprüft und gespeichert.
Für eine spätere Antwort kann `replyTo` (falls vorhanden) oder `sender`
als Empfänger und Outlooks Message Id in `Reply to email (V3)` mit dem
Original Mailbox Address verwendet werden. Die Antwortfunktion selbst ist
hier noch nicht umgesetzt.

Der **HTTP**-Connector kann eine Power-Automate-Premium-Lizenz erfordern.
Falls die Aktion im Tenant nicht verfügbar ist, vor Aktivierung eine
freigegebene Alternative für den HTTPS-Aufruf festlegen.

## KI-Auswertung im Dev-Projekt

Für die KI-Auswertung wird ein eigener OpenAI API-Schlüssel verwendet. Er
gehört ausschließlich in das Firebase Secret `STATUS_MAIL_OPENAI_API_KEY` im
Dev-Projekt. Im Terminal setzen (den Schlüssel erst bei der Eingabeaufforderung
einfügen):

```powershell
firebase functions:secrets:set STATUS_MAIL_OPENAI_API_KEY --project db-bpl-drehpunkt-dev
```

Die Funktion `processStatusMailAiOnCreate` wird bei **neu gespeicherten**
zugeordneten Status-Mails ausgelöst. Sie sendet die aktuelle Mail sowie
vorhandene Trackingwerte, die berechnete Strecke, bis zu zwölf vorherige
Auftragsmails, bis zu zwölf tatsächlich gesendete manuelle Anfragen, bis zu
zwölf automatische Anfragen mit Vorlagenbezug und
aktuelle Trackingereignisse als Kontext an OpenAI. Frühere Nachrichten dienen
der Einordnung, nicht als Beleg für neue Werte. Sie fordert strukturierte
Statuswerte an und speichert nur
Angaben mit hoher Modell-Sicherheit und belegender Originalstelle. Bestehende
manuelle Werte haben Vorrang. Neuere KI-Mails können ältere KI-Werte
aktualisieren. Ohne eindeutige Angabe bleibt die Sendungsverfolgung unverändert.
Klare Entfernungen zur Entladestelle werden als Standortmeldung zur
Mail-Eingangszeit erfasst. Eine verbleibende Fahrzeit wird mit dem auch in der
Streckenkarte verwendeten Planwert von 70 km/h in ungefähre Kilometer
umgerechnet. Beispielsweise ergeben 45 Minuten etwa 53 km. Eindeutige Pausen
mit Beginn und Dauer werden ebenfalls im Verlauf erfasst. Angaben mit unklarer
Station, fehlendem Pausenbeginn, widersprüchlichem Kontext oder verworfenen Werten werden
mit `ai.reviewRequired` gekennzeichnet und im Auftrag gelb umrandet.
Die KI schreibt nur belegte Werte in die normalen Eingabefelder der
Sendungsverfolgung. Reine Angaben zur Be- oder Entladedauer erzeugen keine
erfundenen Start- oder Endzeiten und erscheinen nicht als Statusereignis.
Übernommene Felder erhalten im Eingabedialog einen violetten Rahmen. Bei einer
manuellen Änderung wird die KI-Herkunft für das Feld entfernt. Vorhandene
Standortmeldungen und Pausen können im Dialog „Unterwegs“ korrigiert werden;
die Korrektur wird als manuell protokolliert. Im Zeitstrahl zeigt nur die Farbe
des Symbols vor einem Wert dessen KI-Herkunft an.
Auswertung und Ergebnis stehen im `ai`-Feld der zugeordneten Mail; Tokenverbrauch
und geschätzte Kosten werden als `status_mail_tracking` in `aiUsage` erfasst.
Die API-Anfrage verwendet `store: false`.

Bereits vor dem Deploy gespeicherte Mails werden durch den Erstellungs-Trigger
nicht nachträglich ausgewertet. Für einen End-to-End-Test nach dem Deploy eine
neue zuordenbare Status-Mail an das Postfach senden und im Auftrag die
KI-Markierung sowie den Verlauf prüfen.
Für Mails mit `Keine eindeutige Statusangabe` oder `KI-Auswertung fehlgeschlagen`
können Nutzer mit Bearbeitungsrecht die KI im Mail-Dialog erneut ausführen.
Das gilt auch für `Statusangabe manuell prüfen`.
Jede erneute Auswertung erzeugt eine weitere OpenAI-Anfrage und wird in
`aiUsage` erfasst. Das Modell darf einen nicht genannten Ort nur aus dem
geplanten Stopptag ableiten, wenn das Datum zu genau einem Stopp passt.

## Prüffälle

Diese Prüffälle sind eine Anleitung. Historische erfolgreiche Maildurchläufe
oben sind kein heutiger End-to-End-Nachweis. Für neue Prüfungen Umgebung,
Auftrag und Ergebnis datiert festhalten; keine echten Mails ohne den vorgesehenen
fachlichen Testablauf auslösen.

1. Testmail mit `Re: Transportauftrag <existierende Dev-TA-Nummer>` an das
   Postfach senden. Im HTTP-Ergebnis `stored` prüfen und im rechten Bereich
   des Dev-Auftrags die Mail öffnen.
2. Gleiche Nachricht erneut an den Endpunkt senden: `duplicate`, kein zweiter
   Eintrag.
3. Mail ohne eindeutige TA-Nummer: `unmatched`, kein DB-Eintrag.
4. Falscher Token: HTTP 401. Falsches Postfach: HTTP 400.

Der Outlook-Trigger kann geschützte oder übergroße Nachrichten auslassen.
Mails, die erst nachträglich in den beobachteten Ordner verschoben werden,
können ebenfalls übergangen werden. Deshalb direkt den Posteingang des
freigegebenen Postfachs beobachten.

## Betrieb und verbleibende Entscheidungen

`unmatched` ist eine erfolgreiche technische Quittierung ohne Speicherung, kein
fachlich zugeordneter Eingang. Der Flow erhält dadurch keinen automatischen
Fehler zur Nachbearbeitung. Betriebsseitig ist festzulegen, wer nicht zuordenbare
Mails im Postfach prüft; eine automatische neue Fehlerwarteschlange wird hier
nicht zugesagt.

Für Mailinhalte, KI-Ergebnisse und Nutzungsprotokolle ist eine Aufbewahrungs-
und Löschregel einschließlich Zuständigkeit festzulegen. Eine automatische
Bereinigung oder ein Aufbewahrungszeitraum ist durch dieses Runbook nicht
implementiert. Inhalte nicht zusätzlich in Diagnoseprotokolle kopieren.
Jede erneute KI-Auswertung verursacht einen weiteren Anbieteraufruf; bei Fehlern
zuerst Status und Diagnose prüfen, nicht unkontrolliert mehrfach starten.


## Lokales Sammelpaket: hergeleitete Ankunftsangaben (05.11.2026)

Dieser Nachtrag gehört zum Dev-Paket vom 05.11.2026; siehe Releasebeleg. Er gilt
für die gemeinsame Statusinterpretation und ergänzt den persönlichen Postfachdialog.
Die bisherige automatische Übernahme ausdrücklich belegter Angaben bleibt erhalten;
hergeleitete Vorschläge werden niemals dadurch automatisch zu bestätigten Ist-Werten.

| Aktuelle Aussage ohne genauere Uhrzeit | Vorgeschlagener Zeitpunkt | Bedeutung |
| --- | --- | --- |
| Gerade/soeben angekommen | Empfangszeit auf volle fünf Minuten abrunden | Ankunft erfolgt, Zeit angenähert |
| Bereits angekommen / angekommen | Empfangszeit auf volle fünf Minuten abrunden | Ankunft erfolgt; tatsächliche Uhrzeit unbekannt, Ersatzwert |
| Kommt gleich | Empfangszeit auf volle fünf Minuten aufrunden, dann 15 Minuten addieren | Ausschließlich voraussichtliche Ankunft |

Sekunden und Millisekunden gehören zur Rundung: 14:10:00 bleibt beim Aufrunden
14:10; 14:10:01 wird 14:15. Eine ausdrücklich genannte passende Uhrzeit hat Vorrang.
Die Rechnung erfolgt serverseitig auf absoluten Zeitpunkten und funktioniert auch
über Mitternacht und Zeitzonenwechsel hinweg; Anzeige bleibt Europe/Berlin.

Die Station darf anhand des bisherigen Transportverlaufs vorgeschlagen werden.
Vorhandene, zeitlich vor der Mail liegende Angaben müssen die Herleitung stützen;
keine erfundene pauschale Schwelle für „schon länger“. Widersprüchliche/future Werte,
Fragen, Verneinungen und alte zitierte Statusaussagen sind keine neue Ankunftsmeldung.
Ein zuvor lediglich hergeleiteter/angenäherter Wert wird nicht erneut als sicherer
Beweis für eine weitere Herleitung verwendet. Ein fehlender eindeutiger Bezug
bleibt prüfbedürftig, statt blind Ladestelle anzunehmen.

Im Modellvertrag timeBasis/stationBasis/contextFields; nach serverseitiger
Validierung requiresConfirmation und derivation mit timeBasis, stationBasis,
basedOnFields, mailReceivedAt, timingApproximate und ruleVersion=1. Relative Zeiten
werden nach der festen Regel berechnet, nicht aus frei erzeugten Modellzeiten
übernommen. Kontext allein macht aus einem Plantermin keine Ist-Ankunft.

Persönlicher Postfachdialog: proposals bleibt kompatibel als Feld/Wert-Abbildung;
proposalDetails enthält nur die begrenzten Herkunftsmerkmale hergeleiteter Werte,
keine Mailkopie/Originalzitate. Erst die vorhandene bestätigte Übernahme schreibt
Status und Historie. Vorgeschlagene Zeit/Station sind im Dialog gekennzeichnet.
Unverändert übernommene Vorschläge behalten ihre derivation auch nach Bestätigung;
eine echte manuelle Zeitkorrektur wird als manual mit originalAiDerivation im
Änderungsbeleg dokumentiert und beansprucht keine fortbestehende Zeitungenauigkeit.

Die Historie unterscheidet Ereigniszeit, Mail-Eingangszeit und Übernahmezeit,
enthält alten/neuen Wert, Quelle, Bearbeiter sowie die Herleitung. Normale spätere
Trackingkorrekturen erhalten entfernte Ursprungsmerkmale unter oldDerivations;
persönliche feldweise Korrekturen unter oldDerivation. Kleine Metadaten bleiben
am Vorgang; keine zusätzlichen Postfachrechte, Secrets oder Indizes nötig.

Bereits bekannte Ankunft bleibt für den Fortschritt erhalten. Näherungszeiten
liefern keine präzisen Pünktlichkeits-/Wartezeitbeweise und keine unbemerkte
Kette genauer Folgeprognosen. Prüfstand des lokalen Pakets: 275 gezielte Unit-/Regressionsprüfungen erfolgreich,
keine übersprungen. Zwei reale Firestore-Emulatorläufe mit Demo-Projekten:
vier Aktions-/Übernahmeprüfungen sowie neun Status-KI-/Herkunftsprüfungen erfolgreich
(ein Herkunftsbasisfall in beiden Läufen). Sie bestätigen Vorschau ohne Tracking-
Schreibzugriff, bestätigte idempotente Übernahme, spätere Korrektur mit erhaltener
Herkunft, keine automatische Übernahme hergeleiteter Werte sowie parallele Jobs.
Lint, Build, Diffprüfung und Shared-Abgleich (46 Module) erfolgreich; die bestehende
Bundlegrößenwarnung bleibt.

Lokaler Browser mit synthetischen Daten und echten Dialog-/Historienkomponenten:
Vorschlag sichtbar, Tastaturkorrektur entfernt die aktive Herleitungskennzeichnung,
unveränderte und manuelle Übernahme gehen an denselben vorhandenen API-Aufruf;
Stationshistorie zeigt Ereignis-/Mail-/Übernahmezeit getrennt. DE/EN und Light/Dark
geprüft, keine Browser-Konsolenfehler. Nur die Servicegrenze war simuliert; kein
Nachweis einer echten neuen Mail oder einer realen Modellantwort dieses Pakets.
Keine echten Mails versendet, keine Live-Datensätze geändert, kein Push/Deployment.
Abnahme mit echten neuen Mails erfolgt erst nach späterer ausdrücklicher Dev-Freigabe.


## Lokales Sammelpaket: konkrete Antwort vor Verlaufsschätzung (05.11.2026)

Ebenfalls Teil des Dev-Pakets vom 05.11.2026. Die unmittelbar beantwortete Frage
wird aus dem vorhandenen zitierten Schriftverkehr gelesen. Es gibt keine neue
Kopie oder Versionierung des Fragetexts, keine zusätzlichen Graphabrufe und
keinen neuen KI-Aufruf. Geänderte Vorlagen-/Versandtexte werden nicht anhand der
Vorlagen-ID rückwirkend rekonstruiert. Maßgeblich ist der mitgelieferte Inhalt.

Die Auswertung nutzt ausschließlich die nächste zitierte Nachricht; ein älterer
passender Fragetext darf eine dazwischenliegende Antwort nicht überspringen.
Übliche Outlook-/On-wrote-/Quoteformate sind unterstützt. Bilinguale Wiederholungen
zählen als dieselbe Frage. Explizit widersprechende TA-Bezüge sperren den Kontext.
Fehlt die Frage tatsächlich im Text, bleibt der bisherige vorsichtige Ablauf.

Reihenfolge: konkrete aktuelle Aussage, eindeutiger Antwortbezug, erst danach
plausible Verlaufsschätzung. Eine eindeutig beantwortete Ladeankunftsfrage wird
nicht wegen einer späteren Transportphase zur Entladeankunft. „Ja“ auf eine
Mehrfachfrage (z.B. Plan eingehalten und ETA vorhanden) bestätigt nicht alle Punkte.
„Fertig/beladen“ bestätigt insbesondere keine Abfahrt. Bei Zeitangaben aus dem
Betreff einer alten Anfrage entsteht kein neuer Ist-Zeitbeleg.

„Ja“ auf eine einzelne Ankunftsfrage und „LKW ist da“ mit eindeutigem Bezug bleiben
als Ankunft verwertbar, auch wenn das Modell zunächst keinen Status meldet. Der
eng begrenzte belegprüfende Ersatzpfad schlägt dann die Mailzeit auf fünf Minuten
abgerundet vor; Näherungskennzeichnung und Nutzerbestätigung bleiben erforderlich.
Eine echte Uhrzeit/Dauer in der aktuellen Antwort wird niemals durch die Mailzeit
ersetzt. Nach bestätigter Übernahme zählt die Ankunft für den Fortschritt und
macht eine erneute Ankunftsabfrage überflüssig; nächste offene Schritte bleiben offen.

Die bloße Antwort „80“ auf eine eindeutige Restkilometerfrage kann als 80 km
vorgeschlagen werden. Ohne die passende Frage wird keine Einheit erfunden.
Der Betreff „ETA Entladestelle“ allein beweist keine Kilometerfrage. Bestehende
Strecken-/Wertgrenzen bleiben erhalten. Hergeleitete Entfernungen werden auch im
automatischen Status-Postfach nicht ungeprüft übernommen.

Neue Herkunft stationBasis=reply_context, questionKind als begrenzter Fachcode und
ruleVersion=2. Es werden keine Originalfragen in dieser Herkunft gespeichert.
Bestehende proposals/Transitvorschläge und der bestätigte Übernahmepfad bleiben
kompatibel. Transitvorschläge enthalten optional derivation/requiresConfirmation;
Vergleich und Speicherung verwenden die fachlichen Positionswerte ohne diese
Zusatzmerkmale. Manuelle Änderungen behalten die ursprüngliche Herleitung nur
als ursprünglichen Vorschlag im Änderungsbeleg.

Prüfstand dieses Nachtrags: 314 gezielte Unit-/Regressionsprüfungen erfolgreich,
keine übersprungen. Realer Firestore-Emulatorlauf mit explizitem Demo-Projekt:
14 Prüfungen erfolgreich, darunter Hintergrundjobs, wiederhergestellte Vorschau,
Antwortbezug ohne Fragetextkopie, bestätigte Ankunft mit erhaltenem Fortschritt,
Kilometervorschlag mit Herkunft und unveränderte automatische Schreibsperre für
hergeleitete Werte. Negative/Futur-Antworten, Mehrfachfragen, aktuelle Aussagen
gegenüber altem Betreff, fremde Aufträge und höfliche Kurzantworten sind gesondert
abgedeckt. Vollständiges Lint, Build und Shared-Abgleich (46 Module) erfolgreich;
bestehende Bundlegrößenwarnung unverändert.

Keine realen Mails, Live-Schreibzugriffe oder Modellaufrufe zur Prüfung dieses
Nachtrags. Eine erneute Browser-/Fachprüfung mit echten neuen Antwortmails bleibt
für die spätere ausdrücklich freigegebene Dev-Veröffentlichung offen. Die vorherige
lokale Dialogprüfung des Zeitregelpakets ersetzt diese Fachabnahme nicht.
Kein Push, kein Deployment; keine neuen Rechte, Rules, Indizes oder Secrets.
