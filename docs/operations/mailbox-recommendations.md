# Automatische KI-Handlungsempfehlungen für Postfächer

Stand: 01.11.2026. Ausschließlich Dev freigegeben.

## Bedienung und Umfang

- Persönliches Postfach: Mein Profil → Postfächer → KI-Handlungsempfehlungen
  für neue Mails. Nur der Eigentümer mit Postfächer-Bearbeitungsrecht aktiviert.
- Gemeinsame Postfächer: Adminbereich → Postfächer · KI-Handlungsempfehlungen.
  Nur aktive Admins/Superadmins aktivieren zentral. Im Profil erscheint lediglich
  der gemeinsame Zustand. Ausgangszustand ist deaktiviert.
- Neue Eingangsmails ab Aktivierung werden anhand von Betreff und neuestem
  Klartext eingeordnet. Bekannte Zitatgrenzen werden vorher abgetrennt. Keine
  Anhänge/OCR, Auftragssuche, Feldextraktion, Antwort oder automatische Übernahme.
- Nur sichere Empfehlungen, höchstens drei aus den vorhandenen neun Aktionen.
  Ausschließlich das jeweilige Icon in der KI-Akzentfarbe in der Eingangscard;
  Screenreader/Tooltip benennen die Empfehlung. Kein automatisches Modal.
- Bereits vorhandene Aktionszustände haben Vorrang. Verworfene Ergebnisse
  bekommen dadurch nicht erneut automatisch ein Empfehlungsicon.

## Gemeinsame Identität und Berechtigungen

`mailboxRecommendationScopes/{scope}` enthält die zentrale Aktivierung, den
Fortschritt und eine Verarbeitungssperre. Persönliche Scopes enthalten die
Benutzeridentität; gemeinsame Scopes die Tenant-ID und die tatsächliche
Microsoft-Inbox-ID. Diese wird über einen berechtigten vorhandenen Delegate
aufgelöst und nur serverseitig an der Verbindung zwischengespeichert. Aliase
und verschiedene Benutzer führen dadurch nicht zu unterschiedlichen Ergebnissen.

`.../messages/{hash}` enthält nur Aktionskennungen, Status, Generation und
Zeitpunkte/Versuchszähler; keine Mailtexte, Betreffzeilen oder Anhänge.
`mailboxRecommendationRuns` enthält Arbeitsaufträge. Alle drei Bereiche sind
über Default-deny für direkte Browserzugriffe gesperrt; Emulator-Rechtetest
prüft dies auch für Superadmins. Die Callables prüfen aktive Profile, Eigentum,
Postfachrechte und bei gemeinsamen Verbindungen den zugehörigen Kontozugang.
Empfehlungen werden nur innerhalb eines berechtigten eigenen Zugangs ausgeliefert.

## Hintergrundverarbeitung

Ein Scheduler erzeugt alle fünf Minuten je aktiviertem Scope einen Auftrag.
Der Worker liest bis zu zehn neue Mails pro Seite aus Microsoft. Bei weiteren
Seiten wird mit dem Cursor atomar ein Folgeauftrag angelegt; hohe Eingänge
müssen daher nicht für jede Seite erneut den Fünf-Minuten-Takt abwarten.
Globale Sperre pro Scope und Ergebnis-Cache verhindern reguläre Mehrfachauswertung
desselben Vorgangs. Nach externem KI-Erfolg und Prozessabbruch vor Speicherung
ist wie bei anderen externen Diensten ein erneuter Aufruf technisch möglich.

Microsoft-Nachrichten verwenden Immutable IDs. Erfolgreiche Einordnungen werden
bei erneutem Lesen nicht neu erzeugt; leere Empfehlungen ebenfalls gecacht.
Fehler werden maximal dreimal versucht. Ein Fehler hält die Seite für den
nächsten Durchlauf bereit, erfolgreiche Nachbarn werden nicht erneut ausgewertet.
Deaktivieren/Reaktivieren wechselt die Generation und den Startzeitpunkt;
späte Ergebnisse einer deaktivierten Generation werden nicht veröffentlicht.
Microsoft-GET verändert weder Gelesen-Status noch Nachrichten.

Persönliche Verbindungen werden vor jedem Hintergrundzugriff erneut geprüft.
Gemeinsame Postfächer können auf andere aktive berechtigte Verbindungen desselben
Microsoft-Postfachs ausweichen. Wenn keine Verbindung nutzbar ist, meldet die
Einstellungsansicht einen Fehler. Der Zugriff bleibt in dieser Version abhängig
von mindestens einer gültigen delegierten Verbindung; er ist kein unabhängiger
Mandanten-Daemon. Bestehendes status@-Verhalten wird nicht geändert.

## Microsoft und KI

Keine zusätzlichen Microsoft-Rechte für diesen Polling-Ablauf. Bestehende
delegierte `Mail.Read`, `Mail.Read.Shared` und `offline_access` werden weiter
verwendet. Für zukünftige Echtzeit-Webhooks auf gemeinsamen Postfächern wäre
ein gesondert begrenzter Anwendungszugriff erforderlich; dieser wird hier nicht
eingerichtet. Quellen:

- https://learn.microsoft.com/en-us/graph/outlook-share-messages-folders
- https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions

KI: bestehendes Dev-Secret `STATUS_MAIL_OPENAI_API_KEY`, Modell `gpt-5.4`,
`store: false`, maximal 12.000 Zeichen des neuesten Mailtexts und 1.000 Zeichen
Betreff. Keine Tools, keine Geschäftsdatenabfragen. Usage-Feature
`mailbox_action_recommendation` verwendet die bestehende Nutzungsprotokollierung.
Microsoft-Abfragen/Functions und KI-Aufrufe verursachen die üblichen Betriebskosten.

## Dev-Veröffentlichung und Prüfung

Sechs gezielt bereitgestellte Funktionen, alle als ACTIVE bestätigt:
`getMailboxRecommendationSettings`, `setMailboxRecommendationSettings`,
`listManagedMailboxRecommendations`, `listMailboxRecommendations`,
`enqueueMailboxRecommendations`, `processMailboxRecommendationRun`.
Keine anderen Functions, Rules, Indizes oder Produktionsressourcen ausgerollt.

71 Backend-/Emulator-/Rechtetests und zehn vorhandene Frontend-Helfertests
bestanden. Zwei echte KI-Aufrufe mit ausschließlich synthetischen Mails prüfen
Ankunftsmeldung → tracking und neutrale Antwort mit alter Status-Zitatmail →
keine Empfehlung. Lokaler Browser prüft persönliche/zentral verwaltete Schalter,
gemeinsamen Zustand sowie violettes/grünes/fehlendes Icon. Lint, Build und Abgleich
der 45 Shared-Module erfolgreich, auch nach Integration des aktuellen Dev-Stands.
Vercel-Erfolg für `2ec25981107c05ba96c076bfdf7f1c7a3a131d1d` bestätigt.
Angemeldete Dev-Sitzung zeigt persönlichen Schalter im Profil und gemeinsamen
Schalter im Adminbereich, beide deaktiviert. Gemeinsame Inbox-Identität wird
über die echte vorhandene Microsoft-Verbindung erfolgreich aufgelöst. Keine
echten Postfächer für die Prüfung aktiviert und keine echten Mails versendet.
Der zusätzliche Test für späte Fehler nach Reaktivierung prüft die atomare
Generationssperre; der Worker wurde dafür erneut gezielt erfolgreich in Dev
aktualisiert. Die letzte kleine Frontendergänzung zeigt bei aktivierten
Postfächern den Zeitpunkt der letzten Prüfung bzw. das Warten auf die erste an.

Vorheriger Remote-Dev-Stand: `524956ec72892060b05bb8f27033a603ae651ac4`.
Main-Baseline: `230c2ad86af9700118e2f1456746292241461efc`. Main/Produktion
bleiben unverändert. Rückweg: Aktivierungen abschalten und Frontend auf den
vorherigen Stand zurückstellen; keine Ergebnisse oder Nachrichten löschen.
