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
   und Ausgaben aktivieren.
5. JSON-Body mit den dynamischen Feldern befüllen:

   | JSON-Feld | Power-Automate-Wert |
   | --- | --- |
   | `mailbox` | `status@brennpunkt-logistik.de` (fester Wert) |
   | `messageId` | **Internet Message Id**; falls im Trigger leer: **Message Id** |
   | `subject` | **Subject** |
   | `sender` | **From (Address)** |
   | `bodyText` | Ausgabe von **Html to text** |
   | `receivedAt` | **Received Time** (ISO-Zeitstempel) |

   Beispielstruktur (die spitzen Klammern durch dynamische Inhalte ersetzen):

   ```json
   {
     "mailbox": "status@brennpunkt-logistik.de",
     "messageId": "<Internet Message Id>",
     "subject": "<Subject>",
     "sender": "<From (Address)>",
     "bodyText": "<Html to text output>",
     "receivedAt": "<Received Time>"
   }
   ```

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
