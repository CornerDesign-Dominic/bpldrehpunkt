# Status-Postfach: Eingang über Power Automate (Dev)

## Umfang

Der erste Schritt verarbeitet neue Mails aus dem freigegebenen Postfach
`status@brennpunkt-logistik.de`. Eine Mail wird nur gespeichert, wenn ihr Betreff
genau eine TA-Nummer im Format `TA 260900123` oder `Transportauftrag 260900123`
enthält und `transportOrders.externalNumber` genau einen Auftrag liefert.
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
   addProperty(addProperty(addProperty(addProperty(addProperty(addProperty(json('{}'),'mailbox','status@brennpunkt-logistik.de'),'messageId',if(empty(triggerOutputs()?['body/internetMessageId']),triggerOutputs()?['body/id'],triggerOutputs()?['body/internetMessageId'])),'subject',triggerOutputs()?['body/subject']),'sender',triggerOutputs()?['body/from']),'bodyText',body('HTML_zu_Text')),'receivedAt',triggerOutputs()?['body/receivedDateTime'])
   ```

   Im bestehenden Entwurf ist dieser Ausdruck bereits hinterlegt. Er verwendet:

   | JSON-Feld | Power-Automate-Wert |
   | --- | --- |
   | `mailbox` | `status@brennpunkt-logistik.de` (fester Wert) |
   | `messageId` | **Internet Message Id**; falls im Trigger leer: **Message Id** |
   | `subject` | **Subject** |
   | `sender` | **Von** (`body/from`) |
   | `bodyText` | Ausgabe von **Html to text** |
   | `receivedAt` | **Received Time** (ISO-Zeitstempel) |

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
zugeordneten Status-Mails ausgelöst. Sie sendet Betreff, Mailtext und wenige
Auftragsdaten an OpenAI, fordert strukturierte Statuswerte an und speichert nur
Angaben mit hoher Modell-Sicherheit und belegender Originalstelle. Bestehende
manuelle Werte haben Vorrang. Neuere KI-Mails können ältere KI-Werte
aktualisieren. Ohne eindeutige Angabe bleibt die Sendungsverfolgung unverändert.
Auswertung und Ergebnis stehen im `ai`-Feld der zugeordneten Mail; Tokenverbrauch
und geschätzte Kosten werden als `status_mail_tracking` in `aiUsage` erfasst.
Die API-Anfrage verwendet `store: false`.

Bereits vor dem Deploy gespeicherte Mails werden durch den Erstellungs-Trigger
nicht nachträglich ausgewertet. Für einen End-to-End-Test nach dem Deploy eine
neue zuordenbare Status-Mail an das Postfach senden und im Auftrag die
KI-Markierung sowie den Verlauf prüfen.
Für Mails mit `Keine eindeutige Statusangabe` oder `KI-Auswertung fehlgeschlagen`
können Nutzer mit Bearbeitungsrecht die KI im Mail-Dialog erneut ausführen.
Jede erneute Auswertung erzeugt eine weitere OpenAI-Anfrage und wird in
`aiUsage` erfasst. Das Modell darf einen nicht genannten Ort nur aus dem
geplanten Stopptag ableiten, wenn das Datum zu genau einem Stopp passt.

## Prüffälle

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
