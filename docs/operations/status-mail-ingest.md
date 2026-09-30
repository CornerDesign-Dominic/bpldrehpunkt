# Status-Postfach: Eingang über Power Automate (Dev)

## Umfang

Der erste Schritt verarbeitet neue Mails aus dem freigegebenen Postfach
`status@brennpunkt-logistik.de`. Eine Mail wird nur gespeichert, wenn ihr Betreff
genau eine TA-Nummer im Format `TA 260900123` oder `Transportauftrag 260900123`
enthält und `transportOrders.externalNumber` genau einen Auftrag liefert.
Nicht zuordenbare Mails werden mit HTTP 200 (`unmatched`) quittiert und nicht
gespeichert. Gleiche Nachrichten werden nur einmal gespeichert (`duplicate`).
Die KI-Auswertung und Statusänderungen sind noch kein Teil dieses Schritts.

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

Dev-Entwurf in Power Automate: **DEV | Status-Postfach → Firebase TA-Mails**
([Flow öffnen](https://make.powerautomate.com/environments/Default-b829bbdc-c0b7-4128-a341-6715a67b451b/flows/13d4cc0a-19bd-f111-aaae-6045bd93bcb8?v3=true)).
Er ist erst nach Eintragen des Dev-Tokens und Veröffentlichung aktiv.

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
   Im bestehenden Entwurf steht im Authorization-Header noch
   `Bearer DEVTOKEN_HIER_EINTRAGEN`; vor Veröffentlichung ersetzen.
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
